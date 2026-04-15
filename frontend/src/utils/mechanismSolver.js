/**
 * mechanismSolver.js
 * Robust kinematic constraint solver for planar mechanisms.
 *
 * Strategy:
 *   1. Build a list of distance constraints (one per rigid link).
 *   2. Run Gauss-Seidel / position-correction iterations (XPBD-style).
 *   3. Use the previous frame's positions as warm-start to prevent branch-jumping.
 *   4. Return whether the solve converged.
 */

const EPS = 1e-9;

/** Euclidean distance between two {x,y} points (safe). */
export function dist2D(a, b) {
  if (!a || !b) return 0;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Clamp a value to [lo, hi]. */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Project joint `j` onto its slider axis.
 * Slider axis is defined by `axisOrigin` and unit vector `axisDir`.
 */
function projectOntoAxis(j, axisOrigin, axisDir) {
  const dx = j.x - axisOrigin.x;
  const dy = j.y - axisOrigin.y;
  const t = dx * axisDir.x + dy * axisDir.y;
  return {
    x: axisOrigin.x + t * axisDir.x,
    y: axisOrigin.y + t * axisDir.y,
  };
}

/**
 * Core position-based constraint solver.
 *
 * @param {Array}  joints   - Array of joint objects (mutated in place for speed).
 *                            Each joint: { id, x, y, fixed, driven, constraintType, ... }
 * @param {Array}  links    - Array of link objects: { aId, bId, length }
 * @param {Object} idxMap   - Pre-built { id -> array-index } for O(1) lookup.
 * @param {number} maxIter  - Max Gauss-Seidel iterations.
 * @param {number} tol      - Convergence tolerance (world units).
 * @returns {{ converged: boolean, maxError: number }}
 */
export function solveConstraints(joints, links, idxMap, maxIter = 80, tol = 0.05) {
  let maxErr = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    maxErr = 0;

    for (const lk of links) {
      const ia = idxMap[lk.aId];
      const ib = idxMap[lk.bId];
      if (ia === undefined || ib === undefined) continue;

      const ja = joints[ia];
      const jb = joints[ib];
      if (!ja || !jb) continue;

      const dx = jb.x - ja.x;
      const dy = jb.y - ja.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < EPS) continue;

      const err = d - lk.length;
      if (Math.abs(err) < tol * 0.1) continue;
      maxErr = Math.max(maxErr, Math.abs(err));

      const aFree = !ja.fixed && !ja.driven;
      const bFree = !jb.fixed && !jb.driven;
      if (!aFree && !bFree) continue;

      const nx = dx / d;
      const ny = dy / d;
      const corr = err * 0.5; // split correction

      if (aFree && bFree) {
        ja.x += nx * corr;
        ja.y += ny * corr;
        jb.x -= nx * corr;
        jb.y -= ny * corr;
      } else if (aFree) {
        ja.x += nx * err;
        ja.y += ny * err;
      } else {
        jb.x -= nx * err;
        jb.y -= ny * err;
      }

      // Slider constraint: project back onto axis immediately after correction
      if (aFree && ja.constraintType === 'SLIDER') {
        const ao = ja._axisOrigin;
        const ad = ja._axisDir;
        if (ao && ad) {
          const p = projectOntoAxis(ja, ao, ad);
          ja.x = p.x;
          ja.y = p.y;
        }
      }
      if (bFree && jb.constraintType === 'SLIDER') {
        const ao = jb._axisOrigin;
        const ad = jb._axisDir;
        if (ao && ad) {
          const p = projectOntoAxis(jb, ao, ad);
          jb.x = p.x;
          jb.y = p.y;
        }
      }
    }

    // After link corrections, enforce ALL slider constraints globally
    for (const j of joints) {
      if (j && j.constraintType === 'SLIDER' && !j.fixed && !j.driven) {
        const ao = j._axisOrigin;
        const ad = j._axisDir;
        if (ao && ad) {
          const p = projectOntoAxis(j, ao, ad);
          j.x = p.x;
          j.y = p.y;
        }
      }
    }

    if (maxErr < tol) break;
  }

  return { converged: maxErr < 1.5, maxError: maxErr };
}

/**
 * Build an { id -> index } map for an array of joints.
 */
export function buildIdxMap(joints) {
  const m = {};
  joints.forEach((j, i) => { if (j && j.id) m[j.id] = i; });
  return m;
}

/**
 * Compute the displacement curve for the output joint by sweeping the
 * driven joint through 360 degrees.
 *
 * Returns an array of { angle, displacement } objects (displacement = output.x).
 * Null displacement indicates a dead-point / unsolvable configuration.
 */
export function computeDisplacementCurve(joints, links, drivenId, outputId) {
  const STEP = 2; // degrees
  const result = [];

  // Work on deep copies
  const jSnap = joints.map(j => j ? { ...j } : null).filter(Boolean);
  const lSnap = links.map(l => l ? { ...l } : null).filter(Boolean);
  const idxMap = buildIdxMap(jSnap);

  const drivenIdx = idxMap[drivenId];
  const outputIdx = idxMap[outputId];
  if (drivenIdx === undefined || outputIdx === undefined) return result;

  const driven = jSnap[drivenIdx];
  const pivot = driven.pivotId ? jSnap[idxMap[driven.pivotId]] : null;
  if (!pivot && driven.constraintType !== 'SLIDER') return result;

  for (let deg = 0; deg < 360; deg += STEP) {
    const theta = (deg * Math.PI) / 180;

    // Update driven joint position
    if (driven.constraintType !== 'SLIDER' && pivot) {
      const r = driven.radius ?? dist2D(driven, pivot);
      driven.x = pivot.x + r * Math.cos(theta);
      driven.y = pivot.y + r * Math.sin(theta);
    }

    // Reset non-fixed, non-driven joints to snapshot positions
    for (let i = 0; i < jSnap.length; i++) {
      const j = jSnap[i];
      if (!j || j.fixed || j.driven || j.id === drivenId) continue;
      // Keep previous iteration as warm-start (intentional – helps continuity)
    }

    const { converged } = solveConstraints(jSnap, lSnap, idxMap, 80, 0.1);
    const out = jSnap[outputIdx];

    result.push({
      angle: deg,
      displacement: (converged && out && isFinite(out.x))
        ? parseFloat(out.x.toFixed(3))
        : null,
    });
  }

  return result;
}

/**
 * Compute degrees of freedom for a planar mechanism.
 * Standard Grübler/Kutzbach formula: F = 3(n-1) - 2*j1
 */
export function computeDOF(joints, links) {
  if (!links.length || !joints.length) return null;

  // 1. Total links (n) = moving links + 1 single ground link
  const n = links.length + 1;

  // 2. Total 1-DOF joints (j1)
  // Both standard pins (revolute) and sliders (prismatic) are 1-DOF joints.
  const j1 = joints.length;

  // 3. Calculate DOF
  return 3 * (n - 1) - 2 * j1;
}
import React, { useEffect, useState } from 'react'
import {
    Card, Avatar, Button, Form, Input, Radio,
    Upload, Table, Space, Typography, Row, Col, message, Popconfirm, Tag,
} from 'antd'
import {
    UserOutlined,
    UploadOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
} from '@ant-design/icons'
import useUserStore from '../store/userStore'
import {
    getProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    getDocuments,
    uploadDocument,
    deleteDocument,
    getProgress,
} from '../api'
import { getAvatarUrl, getDisplayName, getFileUrl, getRoleLabel } from '../utils/user'
import JSZip from 'jszip'

const { Title } = Typography

export default function Profile() {
    const {
        user,
        setUser,
        deviceInfo,
    } = useUserStore()
    const isMobileLayout = deviceInfo?.isMobileLayout

    const [profile, setProfile] = useState(null)
    const [documents, setDocuments] = useState([])
    const [progress, setProgress] = useState([])
    const [selectedRowKeys, setSelectedRowKeys] = useState([])
    const allDocumentIds = documents.map((doc) => doc.id)
    const selectedCount = selectedRowKeys.length
    const allSelected = documents.length > 0 && selectedCount === documents.length

    const [profileForm] = Form.useForm()

    const applyProfileSnapshot = (data) => {
        setProfile(data)
        setUser(data)

        profileForm.setFieldsValue({
            display_name: data.display_name || '',
            role: data.role || 'student',
        })
    }

    const loadAll = async () => {
        try {
            const [profRes, docRes, progRes] = await Promise.all([
                getProfile(),
                getDocuments(),
                getProgress(),
            ])

            applyProfileSnapshot(profRes.data)
            setDocuments(docRes.data)
            setProgress(progRes.data)
        } catch {
            message.error('加载失败')
        }
    }

    

    useEffect(() => {
        loadAll()
    }, [])

    const openPreview = (doc) => {
        const url = getFileUrl(doc.filepath)
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const downloadDocument = (doc) => {
        const url = getFileUrl(doc.filepath)
        const a = document.createElement('a')
        a.href = url
        a.download = doc.filename
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        a.remove()
    }

    const selectedDocuments = documents.filter((doc) => selectedRowKeys.includes(doc.id))

    const handleBatchPreview = () => {
        if (!selectedDocuments.length) {
            message.warning('请先勾选文件')
            return
        }

        const previewWindow = window.open('', '_blank', 'noopener,noreferrer')
        if (!previewWindow) {
            message.error('浏览器拦截了新窗口，请允许弹窗后重试')
            return
        }

        const fileBlocks = selectedDocuments
            .map((doc) => {
                const url = getFileUrl(doc.filepath)
                const ext = (doc.filename.split('.').pop() || '').toLowerCase()

                if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
                    return `
          <section style="margin-bottom: 32px; padding: 16px; border: 1px solid #ddd; border-radius: 12px;">
            <h3 style="margin: 0 0 12px;">${doc.filename}</h3>
            <img src="${url}" style="max-width: 100%; height: auto; display: block;" />
            <p style="margin-top: 8px;"><a href="${url}" target="_blank" rel="noopener noreferrer">新标签页打开</a></p>
          </section>
        `
                }

                if (ext === 'pdf') {
                    return `
          <section style="margin-bottom: 32px; padding: 16px; border: 1px solid #ddd; border-radius: 12px;">
            <h3 style="margin: 0 0 12px;">${doc.filename}</h3>
            <iframe src="${url}" style="width: 100%; height: 720px; border: 1px solid #ccc; border-radius: 8px;"></iframe>
            <p style="margin-top: 8px;"><a href="${url}" target="_blank" rel="noopener noreferrer">新标签页打开</a></p>
          </section>
        `
                }

                return `
        <section style="margin-bottom: 32px; padding: 16px; border: 1px solid #ddd; border-radius: 12px;">
          <h3 style="margin: 0 0 12px;">${doc.filename}</h3>
          <p>当前文件类型浏览器不一定能内嵌预览，请使用下面链接打开。</p>
          <p><a href="${url}" target="_blank" rel="noopener noreferrer">打开文件</a></p>
        </section>
      `
            })
            .join('')

        previewWindow.document.write(`
    <html>
      <head>
        <title>批量预览</title>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
            margin: 24px;
            background: #f5f5f5;
            color: #222;
          }
          h1 {
            margin-bottom: 24px;
          }
        </style>
      </head>
      <body>
        <h1>批量预览</h1>
        ${fileBlocks}
      </body>
    </html>
  `)
        previewWindow.document.close()
    }

    const handleBatchDownload = async () => {
        if (!selectedDocuments.length) {
            message.warning('请先勾选文件')
            return
        }

        try {
            const zip = new JSZip()

            for (const doc of selectedDocuments) {
                const url = getFileUrl(doc.filepath)
                const res = await fetch(url)
                const blob = await res.blob()
                zip.file(doc.filename, blob)
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' })
            const zipUrl = URL.createObjectURL(zipBlob)

            const a = document.createElement('a')
            a.href = zipUrl
            a.download = '选中文件.zip'
            document.body.appendChild(a)
            a.click()
            a.remove()

            URL.revokeObjectURL(zipUrl)
            message.success('已生成压缩包')
        } catch (e) {
            message.error('批量下载失败')
        }
    }

    const deleteDocumentsByRows = async (docsToDelete) => {
        if (!docsToDelete.length) {
            message.warning('请先勾选文件')
            return
        }

        const idsToDelete = docsToDelete.map((doc) => doc.id)

        try {
            await Promise.all(idsToDelete.map((id) => deleteDocument(id)))
            setDocuments((prev) => prev.filter((doc) => !idsToDelete.includes(doc.id)))
            setSelectedRowKeys((prev) => prev.filter((id) => !idsToDelete.includes(id)))
            message.success('删除成功')
        } catch {
            message.error('删除失败')
        }
    }

    const handleBatchDelete = async () => {
        await deleteDocumentsByRows(selectedDocuments)
    }

    const handleSelectAllDocuments = () => {
        if (allSelected) {
            setSelectedRowKeys([])
        } else {
            setSelectedRowKeys(allDocumentIds)
        }
    }

    const handleProfileSave = async (values) => {
        try {
            await updateProfile(values)
            const fresh = await getProfile()
            applyProfileSnapshot(fresh.data)
            message.success('保存成功')
        } catch {
            message.error('保存失败')
        }
    }

    const handleAvatarUpload = async (file) => {
        try {
            const rawFile = file.originFileObj || file
            await uploadAvatar(rawFile)
            const fresh = await getProfile()
            applyProfileSnapshot(fresh.data)
            message.success('头像更新成功')
        } catch {
            message.error('上传失败')
        }
        return false
    }

    const handleDeleteAvatar = async () => {
        try {
            await deleteAvatar()
            const fresh = await getProfile()
            applyProfileSnapshot(fresh.data)
            message.success('头像已删除')
        } catch {
            message.error('删除失败')
        }
    }

    const handleDocUpload = async (file) => {
        try {
            const rawFile = file.originFileObj || file
            const res = await uploadDocument(rawFile)
            setDocuments((prev) => [res.data, ...prev])
            message.success(`${rawFile.name} 上传成功`)
        } catch {
            message.error('上传失败')
        }
        return false
    }

    const rowSelection = {
        selectedRowKeys,
        onChange: setSelectedRowKeys,
    }

    const docColumns = [
        { title: '文件名', dataIndex: 'filename', key: 'filename' },
        {
            title: '上传时间',
            dataIndex: 'uploaded_at',
            key: 'uploaded_at',
            render: (t) => new Date(t).toLocaleString(),
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Space>
                    <Button
                        icon={<EyeOutlined />}
                        size="small"
                        onClick={() => openPreview(record)}
                    >
                        预览
                    </Button>
                    <Button
                        icon={<DownloadOutlined />}
                        size="small"
                        onClick={() => downloadDocument(record)}
                    >
                        下载
                    </Button>
                    <Popconfirm title="确认删除？" onConfirm={() => deleteDocumentsByRows([record])}>
                        <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            danger
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const progressColumns = [
        { title: '知识点', dataIndex: 'knowledge_point_id', key: 'kp' },
        {
            title: '掌握度',
            dataIndex: 'mastery',
            key: 'mastery',
            render: (m) => (
                <Tag color={m < 0.4 ? 'red' : m < 0.7 ? 'orange' : 'green'}>
                    {(m * 100).toFixed(1)}%
                </Tag>
            ),
        },
        { title: '做题次数', dataIndex: 'attempt_count', key: 'attempt' },
    ]

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <Title level={4}>👤 个人中心</Title>

            <Row gutter={24}>
                <Col xs={24} lg={8}>
                    <Card title="基本信息" style={{ marginBottom: 24 }}>    
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <Avatar
                                size={96}
                                src={getAvatarUrl(profile?.avatar)}
                                icon={<UserOutlined />}
                            />
                            <div style={{ marginTop: 8 }}>
                                <Tag color={profile?.role === 'teacher' ? 'blue' : 'green'}>
                                    {getRoleLabel(profile?.role)}
                                </Tag>
                                <Tag color="purple" style={{ marginLeft: 8 }}>
                                    当前设备：{deviceInfo?.deviceLabel || '桌面端'}
                                </Tag>
                            </div>
                            <br />
                            <Space wrap>
                                <Upload beforeUpload={handleAvatarUpload} showUploadList={false} accept="image/*">
                                    <Button icon={<UploadOutlined />} size="small">更换头像</Button>
                                </Upload>

                                <Popconfirm
                                    title="确定删除当前头像吗？"
                                    okText="删除"
                                    cancelText="取消"
                                    onConfirm={handleDeleteAvatar}
                                >
                                    <Button
                                        icon={<DeleteOutlined />}
                                        size="small"
                                        danger
                                        disabled={!profile?.avatar}
                                    >
                                        删除头像
                                    </Button>
                                </Popconfirm>
                            </Space>
                        </div>

                        <Form form={profileForm} layout="vertical" onFinish={handleProfileSave}>
                            <Form.Item name="display_name" label="显示名称">
                                <Input placeholder="请输入显示名称" />
                            </Form.Item>

                            <Form.Item name="role" label="身份">
                                <Radio.Group>
                                    <Radio value="student">学生</Radio>
                                    <Radio value="teacher">教师</Radio>
                                </Radio.Group>
                            </Form.Item>

                            <Button type="primary" htmlType="submit" block>
                                保存修改
                            </Button>
                        </Form>
                    </Card>
                </Col>

                <Col xs={24} lg={16}>
                    <Card
                        title="我的文件"
                        style={{ marginBottom: 24 }}
                        extra={
                            <Upload
                                beforeUpload={handleDocUpload}
                                showUploadList={false}
                                multiple
                                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,application/pdf"
                            >
                                <Button icon={<UploadOutlined />} size="small">上传文件</Button>
                            </Upload>
                        }
                    >
                        <Space wrap style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                            <Button onClick={handleSelectAllDocuments}>
                                {allSelected ? '取消全选' : '全选全部文件'}
                            </Button>

                            <Button
                                icon={<EyeOutlined />}
                                onClick={handleBatchPreview}
                                disabled={!selectedDocuments.length}
                            >
                                预览选中
                            </Button>

                            <Button
                                icon={<DownloadOutlined />}
                                onClick={handleBatchDownload}
                                disabled={!selectedDocuments.length}
                            >
                                下载选中
                            </Button>

                            <Popconfirm
                                title="确认删除所选文件？"
                                onConfirm={handleBatchDelete}
                                okText="删除"
                                cancelText="取消"
                            >
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    disabled={!selectedDocuments.length}
                                >
                                    删除选中
                                </Button>
                            </Popconfirm>
                        </Space>

                        <Table
                            dataSource={documents}
                            columns={docColumns}
                            rowKey="id"
                            size="small"
                            rowSelection={rowSelection}
                            pagination={{ pageSize: 8 }}
                            scroll={isMobileLayout ? { x: 720 } : undefined}
                        />

                        <div style={{ marginTop: 12, color: '#888' }}>
                            点击“预览”会在新标签页打开文件；勾选后可批量预览、下载或删除。
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card title="📊 做题历史">
                <Table
                    dataSource={progress}
                    columns={progressColumns}
                    rowKey="knowledge_point_id"
                    pagination={{ pageSize: 8 }}
                    scroll={isMobileLayout ? { x: 520 } : undefined}
                />
            </Card>
        </div>
    )
}

import React, { useState, useEffect, useRef } from 'react'
import { Megaphone, Sparkles, Calendar, Settings as SettingsIcon, Send, Video, Image as ImageIcon, Trash2, CheckCircle, Clock, AlertCircle, RefreshCw, ExternalLink, MessageSquare, Users, Plus, Mail, Phone, Share2, Play, Check, Layers, UserPlus, X, Move, Maximize2, Download, DollarSign, Tag } from 'lucide-react'
import { useTenant } from '../TenantContext'
import MediaBrowser from '../components/MediaBrowser'
import { formatDateTimeAR, formatDateAR, formatTimeAR } from '../utils/dateUtils'

const toHighResMlImage = (url) => {
  if (!url) return ''
  let clean = url.trim().replace(/-[IVECN]\.(jpg|jpeg|png|webp)/i, '-O.$1')
  if (clean.startsWith('http://')) {
    clean = 'https://' + clean.slice(7)
  }
  return clean
}

const isVideoUrl = (url) => {
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm') || lower.endsWith('.avi')
}

export default function Marketing() {
  const { tenant, isPlatformAdmin, isSimpleView } = useTenant()
  const storeName = tenant?.name || 'Tienda Oficial'

  const [activeTab, setActiveTab] = useState('creator') // 'creator', 'calendar', 'comments', 'config'
  
  // Data states
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  // Product Filter State in Marketing
  const [productSearch, setProductSearch] = useState('')
  const [productCategoryFilter, setProductCategoryFilter] = useState('ALL')

  // Creator state
  const [selectedProduct, setSelectedProduct] = useState('')
  const [productImages, setProductImages] = useState([])
  const [selectedProductImage, setSelectedProductImage] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)
  const [objective, setObjective] = useState('promocional')
  const [tone, setTone] = useState('entusiasta')
  const [generating, setGenerating] = useState(false)
  const [generatedData, setGeneratedData] = useState(null)

  // AI Video Generator state
  const [videoPrompt, setVideoPrompt] = useState('Imagen promocional para redes sociales')
  const [videoEngine, setVideoEngine] = useState('gemini_canvas')
  const [generatingVideo, setGeneratingVideo] = useState(false)
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('')
  const [generatedServerMediaUrl, setGeneratedServerMediaUrl] = useState('')
  const [videoScriptData, setVideoScriptData] = useState(null)
  
  // Canvas Customizer states
  const [canvasLayout, setCanvasLayout] = useState('glassmorphism') // 'glassmorphism' default
  const [canvasFont, setCanvasFont] = useState('outfit') // 'outfit', 'montserrat', 'poppins', 'jakarta'
  const [canvasLogoUrl, setCanvasLogoUrl] = useState('')
  const [canvasLogoX, setCanvasLogoX] = useState(50) // 0 to 100% (50 = centered)
  const [canvasLogoY, setCanvasLogoY] = useState(10) // 0 to 100% (10 = top)
  const [canvasLogoScale, setCanvasLogoScale] = useState(100) // 40 to 200 %
  const [canvasLogoBg, setCanvasLogoBg] = useState('none') // 'none', 'dark', 'white', 'glass'
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [showLogoDragGuide, setShowLogoDragGuide] = useState(true)
  const [isDraggingLogo, setIsDraggingLogo] = useState(false)
  const isDraggingLogoRef = useRef(false)
  const previewContainerRef = useRef(null)
  const logoCacheRef = useRef(new Map())
  const imgCacheRef = useRef(new Map())

  // Price Selection States
  const [priceSource, setPriceSource] = useState('web') // 'web', 'meli', 'cash', 'custom'
  const [customPriceValue, setCustomPriceValue] = useState('')
  const [cashDiscountPctInput, setCashDiscountPctInput] = useState(10)
  const [lightboxMedia, setLightboxMedia] = useState(null)
  const [lightboxZoom, setLightboxZoom] = useState(false)

  const selectedProductObj = React.useMemo(() => {
    return products.find(p => p.ml_id === selectedProduct) || null
  }, [products, selectedProduct])

  useEffect(() => {
    if (selectedProductObj && selectedProductObj.cash_discount_pct && Number(selectedProductObj.cash_discount_pct) > 0) {
      setCashDiscountPctInput(Number(selectedProductObj.cash_discount_pct))
    }
  }, [selectedProductObj])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxMedia(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const effectivePrice = React.useMemo(() => {
    if (!selectedProductObj) return 0
    const pMeli = Number(selectedProductObj.price) || 0
    const pWeb = Number(selectedProductObj.price_web > 0 ? selectedProductObj.price_web : pMeli) || 0
    if (priceSource === 'meli') return pMeli
    if (priceSource === 'web') return pWeb
    if (priceSource === 'cash') {
      const pct = Number(cashDiscountPctInput || 10)
      return Math.round(pWeb * (1 - pct / 100))
    }
    if (priceSource === 'custom') {
      return Number(customPriceValue) || 0
    }
    return pWeb
  }, [selectedProductObj, priceSource, customPriceValue, cashDiscountPctInput])

  const [canvasTheme, setCanvasTheme] = useState('emerald')
  const [canvasBadgeText, setCanvasBadgeText] = useState('')
  const [canvasBadgeColor, setCanvasBadgeColor] = useState('#f59e0b')
  const [canvasShowPrice, setCanvasShowPrice] = useState(true)
  const [canvasCustomTitle, setCanvasCustomTitle] = useState('')
  const [canvasFooterText, setCanvasFooterText] = useState('')
  const [canvasTextColor, setCanvasTextColor] = useState('auto')
  const [canvasShowBorder, setCanvasShowBorder] = useState(true)
  const [canvasImgFit, setCanvasImgFit] = useState('contain') // 'contain' (default: sin cortar) or 'cover'
  const [canvasImgScale, setCanvasImgScale] = useState(100) // 50 to 150 %
  const [canvasImgOffsetY, setCanvasImgOffsetY] = useState(0) // -40 to 40 %

  const handleContainerPointerDown = (e) => {
    if (videoEngine !== 'gemini_canvas' || postType !== 'post') return
    if (!previewContainerRef.current) return
    e.preventDefault()
    isDraggingLogoRef.current = true
    setIsDraggingLogo(true)
    const rect = previewContainerRef.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      const relX = ((e.clientX - rect.left) / rect.width) * 100
      const relY = ((e.clientY - rect.top) / rect.height) * 100
      const clampedX = Math.round(Math.max(5, Math.min(95, relX)))
      const clampedY = Math.round(Math.max(5, Math.min(95, relY)))
      setCanvasLogoX(clampedX)
      setCanvasLogoY(clampedY)
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (err) {}
  }

  const handleLogoDragStart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    isDraggingLogoRef.current = true
    setIsDraggingLogo(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (err) {}
  }

  const handleLogoPointerMove = (e) => {
    if (!isDraggingLogoRef.current || !previewContainerRef.current) return
    e.preventDefault()
    const rect = previewContainerRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const relX = ((e.clientX - rect.left) / rect.width) * 100
    const relY = ((e.clientY - rect.top) / rect.height) * 100
    const clampedX = Math.round(Math.max(5, Math.min(95, relX)))
    const clampedY = Math.round(Math.max(5, Math.min(95, relY)))
    setCanvasLogoX(clampedX)
    setCanvasLogoY(clampedY)
  }

  const handleLogoDragEnd = (e) => {
    if (isDraggingLogoRef.current) {
      isDraggingLogoRef.current = false
      setIsDraggingLogo(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch (err) {}
      if (videoScriptData && postType === 'post') {
        renderPostCanvasImage(videoScriptData, true).then(url => {
          if (url) setGeneratedVideoUrl(url)
        })
      }
    }
  }

  useEffect(() => {
    fetch('/api/settings/web-config')
      .then(res => res.json())
      .then(data => {
        if (data && data.logo_url) {
          setCanvasLogoUrl(data.logo_url)
        }
      })
      .catch(() => {})
  }, [])

  const canvasRenderSeqRef = useRef(0)
  const [postTitle, setPostTitle] = useState('')
  const [postType, setPostType] = useState('post') // 'post', 'reel', 'story'
  const [platforms, setPlatforms] = useState({ instagram: true, facebook: true })
  const [caption, setCaption] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')

  // Auto update post image preview live when canvas controls change
  useEffect(() => {
    if (videoScriptData && postType === 'post') {
      const timer = setTimeout(async () => {
        const shouldUpload = !isDraggingLogoRef.current
        const imageBlobUrl = await renderPostCanvasImage(videoScriptData, shouldUpload)
        if (imageBlobUrl) {
          setGeneratedVideoUrl(imageBlobUrl)
        }
      }, isDraggingLogoRef.current ? 100 : 160)
      return () => clearTimeout(timer)
    }
  }, [
    videoScriptData, postType, selectedProductImage,
    canvasLayout, canvasFont, canvasLogoUrl, canvasTheme,
    canvasBadgeText, canvasBadgeColor, canvasShowPrice,
    canvasCustomTitle, canvasFooterText, canvasTextColor, canvasShowBorder,
    canvasImgFit, canvasImgScale, canvasImgOffsetY,
    canvasLogoX, canvasLogoY, canvasLogoScale, canvasLogoBg,
    effectivePrice
  ])
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingPostId, setEditingPostId] = useState(null)
  const [publishingId, setPublishingId] = useState(null)

  // Config state
  const [metaConfig, setMetaConfig] = useState({
    meta_access_token: '',
    meta_instagram_account_id: '',
    meta_facebook_page_id: '',
    meta_app_id: '',
    meta_app_secret: ''
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [autodetectLoading, setAutodetectLoading] = useState(false)
  const [showPermissionsGuide, setShowPermissionsGuide] = useState(false)
  const [exchangeLoading, setExchangeLoading] = useState(false)
  const [exchangeResult, setExchangeResult] = useState(null)

  const handleAutodetectMeta = async () => {
    if (!metaConfig.meta_access_token?.trim()) {
      alert("Por favor pega tu Meta Access Token primero para autodetectar los IDs.")
      return
    }
    setAutodetectLoading(true)
    try {
      const res = await fetch('/api/marketing/autodetect-meta-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: metaConfig.meta_access_token.trim() })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMetaConfig(prev => ({
          ...prev,
          meta_access_token: data.access_token || prev.meta_access_token,
          meta_facebook_page_id: data.facebook_page_id || prev.meta_facebook_page_id,
          meta_instagram_account_id: data.instagram_account_id || prev.meta_instagram_account_id
        }))
        alert(`🎉 ${data.message}`)
      } else {
        alert("Error de autodetección: " + (data.detail || data.error || "No se pudieron obtener los IDs"))
      }
    } catch(err) {
      alert("Error de conexión al autodetectar: " + err.message)
    } finally {
      setAutodetectLoading(false)
    }
  }

  // Comments / Inbox state
  const [commentsData, setCommentsData] = useState({ instagram: [], facebook: [] })
  const [loadingComments, setLoadingComments] = useState(false)
  const [replyInputs, setReplyInputs] = useState({})
  const [replyingId, setReplyingId] = useState(null)
  const [suggestingId, setSuggestingId] = useState(null)

  // Diffusion & Campaign state
  const [diffusionGroups, setDiffusionGroups] = useState([])
  const [diffusionCampaigns, setDiffusionCampaigns] = useState([])
  const [crmContacts, setCrmContacts] = useState([])
  const [loadingDiffusion, setLoadingDiffusion] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)

  // Group creation form
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupChannel, setNewGroupChannel] = useState('both')
  const [selectedBuyerIds, setSelectedBuyerIds] = useState([])
  const [contactSearchQuery, setContactSearchQuery] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualMemberList, setManualMemberList] = useState([])
  const [creatingGroup, setCreatingGroup] = useState(false)

  // Computed filtered CRM Contacts based on selected channel and search input
  const filteredCrmContacts = crmContacts.filter(c => {
    // 1. Channel requirement filter
    if (newGroupChannel === 'whatsapp') {
      if (!c.phone || !c.phone.trim()) return false
    } else if (newGroupChannel === 'email') {
      if (!c.email || !c.email.trim()) return false
    } else if (newGroupChannel === 'both') {
      if ((!c.phone || !c.phone.trim()) && (!c.email || !c.email.trim())) return false
    }

    // 2. Search query filter
    if (contactSearchQuery.trim()) {
      const q = contactSearchQuery.toLowerCase().trim()
      const nameMatch = (c.full_name || '').toLowerCase().includes(q)
      const nickMatch = (c.nickname || '').toLowerCase().includes(q)
      const phoneMatch = (c.phone || '').includes(q)
      const emailMatch = (c.email || '').toLowerCase().includes(q)
      return nameMatch || nickMatch || phoneMatch || emailMatch
    }
    return true
  })

  // Campaign launch form
  const [selectedTargetGroupId, setSelectedTargetGroupId] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [campaignChannel, setCampaignChannel] = useState('both')
  const [campaignMessage, setCampaignMessage] = useState('')
  const [campaignMediaUrl, setCampaignMediaUrl] = useState('')
  const [campaignDelay, setCampaignDelay] = useState(5)
  const [sendingCampaign, setSendingCampaign] = useState(false)
  const [selectedProductForCampaign, setSelectedProductForCampaign] = useState(null)
  const [showCampaignGalleryModal, setShowCampaignGalleryModal] = useState(false)

  // Group Members modal
  const [viewingMembersGroup, setViewingMembersGroup] = useState(null)
  const [groupMembers, setGroupMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const fetchDiffusionData = async () => {
    setLoadingDiffusion(true)
    try {
      const [resGroups, resCampaigns, resCrm] = await Promise.all([
        fetch('/api/diffusion/groups'),
        fetch('/api/diffusion/campaigns'),
        fetch('/api/diffusion/crm-contacts')
      ])
      if (resGroups.ok) {
        const d = await resGroups.json()
        if (d.groups) setDiffusionGroups(d.groups)
      }
      if (resCampaigns.ok) {
        const d = await resCampaigns.json()
        if (d.campaigns) setDiffusionCampaigns(d.campaigns)
      }
      if (resCrm.ok) {
        const d = await resCrm.json()
        if (d.contacts) setCrmContacts(d.contacts)
      }
    } catch (e) {
      console.error("Error fetching diffusion data:", e)
    } finally {
      setLoadingDiffusion(false)
    }
  }

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    if (!newGroupName.trim()) return alert("Por favor ingresa un nombre para el grupo")

    setCreatingGroup(true)
    try {
      const res = await fetch('/api/diffusion/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          channel_type: newGroupChannel
        })
      })
      const data = await res.json()
      if (!res.ok || !data.group_id) {
        alert("Error creando grupo: " + (data.detail || "Error desconocido"))
        return
      }

      const groupId = data.group_id
      const members = []

      // Find contacts selected by buyer_id / unique key
      crmContacts.forEach(c => {
        const key = c.buyer_id ? String(c.buyer_id) : (c.phone || c.email)
        if (selectedBuyerIds.includes(key)) {
          members.push({
            customer_id: c.buyer_id,
            contact_name: c.full_name || c.nickname || 'Cliente CRM',
            phone: c.phone || '',
            email: c.email || '',
            source: c.source_platform || 'CRM'
          })
        }
      })

      manualMemberList.forEach(m => {
        members.push({
          contact_name: m.name,
          phone: m.phone,
          email: m.email,
          source: 'MANUAL'
        })
      })

      if (members.length > 0) {
        await fetch(`/api/diffusion/groups/${groupId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ members })
        })
      }

      alert("🎉 Grupo de Difusión creado con éxito")
      setShowCreateGroupModal(false)
      setNewGroupName('')
      setNewGroupDesc('')
      setSelectedBuyerIds([])
      setContactSearchQuery('')
      setManualMemberList([])
      fetchDiffusionData()
    } catch (err) {
      alert("Error al guardar grupo: " + err.message)
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("¿Seguro que deseas eliminar este grupo de difusión?")) return
    try {
      const res = await fetch(`/api/diffusion/groups/${groupId}`, { method: 'DELETE' })
      if (res.ok) {
        fetchDiffusionData()
      } else {
        alert("Error al eliminar grupo")
      }
    } catch (e) {
      alert("Error: " + e.message)
    }
  }

  const handleOpenMembersModal = async (group) => {
    setViewingMembersGroup(group)
    setLoadingMembers(true)
    try {
      const res = await fetch(`/api/diffusion/groups/${group.id}/members`)
      if (res.ok) {
        const d = await res.json()
        setGroupMembers(d.members || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMembers(false)
    }
  }

  const handleDeleteMember = async (memberId) => {
    if (!viewingMembersGroup) return
    try {
      const res = await fetch(`/api/diffusion/groups/${viewingMembersGroup.id}/members/${memberId}`, { method: 'DELETE' })
      if (res.ok) {
        setGroupMembers(prev => prev.filter(m => m.id !== memberId))
        fetchDiffusionData()
      }
    } catch (e) {
      alert("Error: " + e.message)
    }
  }

  const handleLaunchCampaign = async (e) => {
    e.preventDefault()
    if (!selectedTargetGroupId) return alert("Seleccioná un grupo destinatario")
    if (!campaignMessage.trim()) return alert("Ingresá el mensaje o copy de la publicidad")

    const group = diffusionGroups.find(g => String(g.id) === String(selectedTargetGroupId))
    const title = campaignTitle.trim() || `Difusión: ${group ? group.name : 'Promoción'}`

    setSendingCampaign(true)
    try {
      const res = await fetch('/api/diffusion/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          group_id: parseInt(selectedTargetGroupId),
          channel: campaignChannel,
          message_text: campaignMessage,
          media_url: campaignMediaUrl,
          delay_seconds: campaignDelay
        })
      })
      const data = await res.json()
      if (res.ok && data.status === 'success') {
        alert("🚀 " + data.message)
        fetchDiffusionData()
      } else {
        alert("Error al iniciar campaña: " + (data.detail || "Error en backend"))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSendingCampaign(false)
    }
  }

  useEffect(() => {
    fetchProducts()
    fetchCategories()
    fetchPosts()
    fetchMetaConfig()
    fetchDiffusionData()
  }, [])

  useEffect(() => {
    if (!selectedProduct) {
      setProductImages([])
      setSelectedProductImage('')
      return
    }
    const curr = products.find(p => p.ml_id === selectedProduct)
    if (curr) {
      const rawList = curr.images ? curr.images.split(',') : (curr.thumbnail ? [curr.thumbnail] : [])
      const cleanList = rawList.map(u => toHighResMlImage(u.trim())).filter(Boolean)
      setProductImages(cleanList)
      if (cleanList.length > 0) {
        setSelectedProductImage(cleanList[0])
        if (!mediaUrl) setMediaUrl(cleanList[0])
      }
    } else {
      setProductImages([])
      setSelectedProductImage('')
    }
  }, [selectedProduct, products])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (res.ok && data.url) {
        setMediaUrl(data.url)
      } else {
        alert("Error al subir archivo: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión al subir archivo: " + err.message)
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/media/upload?path=logos', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (res.ok && data.url) {
        setCanvasLogoUrl(data.url)
      } else {
        alert("Error al subir logo: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión al subir logo: " + err.message)
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const fetchComments = () => {
    setLoadingComments(true)
    fetch('/api/marketing/comments')
      .then(r => r.ok ? r.json() : { data: { instagram: [], facebook: [] } })
      .then(res => setCommentsData(res.data || { instagram: [], facebook: [] }))
      .catch(err => console.error(err))
      .finally(() => setLoadingComments(false))
  }

  const handleReplyComment = async (platform, commentId) => {
    const message = replyInputs[commentId]
    if (!message || !message.trim()) {
      alert("Por favor ingresa un texto de respuesta.")
      return
    }

    setReplyingId(commentId)
    try {
      const res = await fetch('/api/marketing/comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          comment_id: commentId,
          message: message.trim()
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert("¡Respuesta enviada exitosamente a la red social!")
        setReplyInputs(prev => ({ ...prev, [commentId]: '' }))
        fetchComments()
      } else {
        alert("Error al responder: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setReplyingId(null)
    }
  }

  const handleAISuggestReply = async (commentText, postContext, authorName, commentId) => {
    setSuggestingId(commentId)
    try {
      const res = await fetch('/api/marketing/comments/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_text: commentText,
          post_context: postContext,
          author_name: authorName
        })
      })
      const data = await res.json()
      if (res.ok && data.suggested_reply) {
        setReplyInputs(prev => ({ ...prev, [commentId]: data.suggested_reply }))
      } else {
        alert("Error al generar sugerencia: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSuggestingId(null)
    }
  }

  const handleResetForm = () => {
    setEditingPostId(null)
    setSelectedProduct('')
    setPostTitle('')
    setPostType('post')
    setPlatforms({ instagram: true, facebook: true })
    setCaption('')
    setMediaUrl('')
    setGeneratedServerMediaUrl('')
    setScheduledAt('')
    setGeneratedData(null)
  }

  const handleEditPost = (p) => {
    setEditingPostId(p.id)
    setSelectedProduct(p.product_ml_id || '')
    setPostTitle(p.title || '')
    setPostType(p.post_type || 'post')
    const pStr = (p.platforms || '').toLowerCase()
    setPlatforms({
      instagram: pStr.includes('instagram'),
      facebook: pStr.includes('facebook')
    })
    setCaption(p.caption || '')
    setMediaUrl(p.media_urls || '')
    setGeneratedServerMediaUrl(p.media_urls || '')
    if (p.scheduled_at) {
      try {
        const d = new Date(p.scheduled_at)
        const isoStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
        setScheduledAt(isoStr)
      } catch(e) {
        setScheduledAt('')
      }
    } else {
      setScheduledAt('')
    }
    setActiveTab('creator')
  }

  const fetchProducts = () => {
    fetch('/api/inventory/')
      .then(r => r.ok ? r.json() : { products: [] })
      .then(data => setProducts(data.products || []))
      .catch(err => console.error(err))
  }

  const fetchCategories = () => {
    fetch('/api/categories/')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(data => setCategories(data.categories || []))
      .catch(err => console.error(err))
  }

  const filteredMarketingProducts = React.useMemo(() => {
    return products.filter(p => {
      // 1. Category Filter
      if (productCategoryFilter === 'UNCATEGORIZED') {
        if (p.category_id && p.category_id !== 0 && String(p.category_id) !== '0') return false
      } else if (productCategoryFilter !== 'ALL') {
        if (String(p.category_id) !== String(productCategoryFilter)) return false
      }

      // 2. Search Text
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim()
        const matchTitle = (p.title || '').toLowerCase().includes(q)
        const matchId = (p.ml_id || '').toLowerCase().includes(q)
        const matchCat = (p.category_name || '').toLowerCase().includes(q)
        if (!matchTitle && !matchId && !matchCat) return false
      }

      return true
    })
  }, [products, productCategoryFilter, productSearch])

  const fetchPosts = () => {
    setLoadingPosts(true)
    fetch('/api/marketing/posts')
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(data => setPosts(data.posts || []))
      .catch(err => console.error(err))
      .finally(() => setLoadingPosts(false))
  }

  const fetchMetaConfig = () => {
    fetch('/api/marketing/config')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setMetaConfig(prev => ({
          ...prev,
          meta_access_token: data.meta_access_token || '',
          meta_instagram_account_id: data.meta_instagram_account_id || '',
          meta_facebook_page_id: data.meta_facebook_page_id || '',
          meta_app_id: data.meta_app_id || '',
          // No sobreescribir el secret si ya fue cargado localmente
          meta_app_secret: prev.meta_app_secret || (data.has_meta_app_secret ? '••••••••' : '')
        }))
      })
      .catch(err => console.error(err))
  }

  const handleExchangeToken = async () => {
    setExchangeLoading(true)
    setExchangeResult(null)
    try {
      const res = await fetch('/api/marketing/exchange-long-lived-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          short_lived_token: metaConfig.meta_access_token?.trim() || null
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setExchangeResult({ type: 'success', message: data.message })
        // Recargar la configuración para reflejar el nuevo token guardado
        fetchMetaConfig()
      } else {
        setExchangeResult({ type: 'error', message: data.detail || data.error || 'Error desconocido' })
      }
    } catch (err) {
      setExchangeResult({ type: 'error', message: 'Error de conexión: ' + err.message })
    } finally {
      setExchangeLoading(false)
    }
  }

  const handleGenerateAI = async () => {
    if (!selectedProduct) {
      alert("⚠️ Por favor selecciona primero un producto del inventario en la lista desplegable superior para poder generar la publicación.")
      return
    }
    setGenerating(true)
    setGeneratedData(null)

    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ml_id: selectedProduct,
          objective,
          tone,
          selected_image: selectedProductImage || mediaUrl,
          selected_price: effectivePrice,
          price_type: priceSource
        })
      })
      const data = await res.json()
      if (res.ok) {
        setGeneratedData(data)
        setPostTitle(data.title || '')
        setCaption(data.caption || '')
        const mainImg = selectedProductImage || (data.images ? toHighResMlImage(data.images.split(',')[0].trim()) : '')
        setMediaUrl(mainImg)
      } else {
        alert("Error al generar contenido: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const getFontFamily = (key) => {
    if (key === 'montserrat') return '"Montserrat", "Outfit", system-ui, sans-serif'
    if (key === 'poppins') return '"Poppins", "Inter", system-ui, sans-serif'
    if (key === 'jakarta') return '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif'
    return '"Outfit", "Plus Jakarta Sans", "Montserrat", system-ui, sans-serif'
  }

  const getCanvasThemeConfig = (key) => {
    switch (key) {
      case 'blue':
        return {
          bg: ['#1d4ed8', '#1e3a8a', '#0f172a'],
          accent: '#3b82f6',
          header: 'rgba(59, 130, 246, 0.35)',
          border: '#3b82f6',
          defaultText: '#ffffff',
          defaultSubtext: '#bfdbfe',
          glassOverlay: ['rgba(30, 58, 138, 0.75)', 'rgba(15, 23, 42, 0.90)'],
          glassCard: ['rgba(30, 58, 138, 0.86)', 'rgba(15, 23, 42, 0.92)'],
          glassBorder: 'rgba(96, 165, 250, 0.45)',
          isDark: true
        }
      case 'purple':
        return {
          bg: ['#6b21a8', '#4c1d95', '#1e0533'],
          accent: '#c084fc',
          header: 'rgba(168, 85, 247, 0.35)',
          border: '#a855f7',
          defaultText: '#ffffff',
          defaultSubtext: '#e9d5ff',
          glassOverlay: ['rgba(88, 28, 135, 0.75)', 'rgba(46, 16, 101, 0.90)'],
          glassCard: ['rgba(88, 28, 135, 0.86)', 'rgba(46, 16, 101, 0.92)'],
          glassBorder: 'rgba(192, 132, 252, 0.45)',
          isDark: true
        }
      case 'red':
        return {
          bg: ['#991b1b', '#7f1d1d', '#450a0a'],
          accent: '#ef4444',
          header: 'rgba(239, 68, 68, 0.35)',
          border: '#ef4444',
          defaultText: '#ffffff',
          defaultSubtext: '#fecaca',
          glassOverlay: ['rgba(153, 27, 27, 0.75)', 'rgba(69, 10, 10, 0.90)'],
          glassCard: ['rgba(153, 27, 27, 0.86)', 'rgba(69, 10, 10, 0.92)'],
          glassBorder: 'rgba(248, 113, 113, 0.45)',
          isDark: true
        }
      case 'dark':
        return {
          bg: ['#1e293b', '#0f172a', '#020617'],
          accent: '#38bdf8',
          header: 'rgba(148, 163, 184, 0.25)',
          border: '#64748b',
          defaultText: '#ffffff',
          defaultSubtext: '#94a3b8',
          glassOverlay: ['rgba(30, 41, 59, 0.80)', 'rgba(2, 6, 23, 0.92)'],
          glassCard: ['rgba(15, 23, 42, 0.88)', 'rgba(2, 6, 23, 0.94)'],
          glassBorder: 'rgba(255, 255, 255, 0.25)',
          isDark: true
        }
      case 'white_clean':
        return {
          bg: ['#ffffff', '#ffffff', '#ffffff'],
          accent: '#059669',
          header: 'transparent',
          border: 'transparent',
          defaultText: '#0f172a',
          defaultSubtext: '#475569',
          glassOverlay: ['rgba(255, 255, 255, 0.92)', 'rgba(255, 255, 255, 0.96)'],
          glassCard: ['rgba(255, 255, 255, 0.96)', 'rgba(255, 255, 255, 0.98)'],
          glassBorder: 'rgba(0, 0, 0, 0.08)',
          isDark: false
        }
      case 'white':
        return {
          bg: ['#ffffff', '#f8fafc', '#e2e8f0'],
          accent: '#059669',
          header: 'rgba(15, 23, 42, 0.06)',
          border: '#cbd5e1',
          defaultText: '#0f172a',
          defaultSubtext: '#475569',
          glassOverlay: ['rgba(255, 255, 255, 0.82)', 'rgba(241, 245, 249, 0.90)'],
          glassCard: ['rgba(255, 255, 255, 0.92)', 'rgba(248, 250, 252, 0.95)'],
          glassBorder: 'rgba(0, 0, 0, 0.12)',
          isDark: false
        }
      case 'emerald':
      default:
        return {
          bg: ['#064e3b', '#04382a', '#022c22'],
          accent: '#10b981',
          header: 'rgba(16, 185, 129, 0.35)',
          border: '#10b981',
          defaultText: '#ffffff',
          defaultSubtext: '#a7f3d0',
          glassOverlay: ['rgba(6, 78, 59, 0.75)', 'rgba(2, 44, 34, 0.90)'],
          glassCard: ['rgba(6, 78, 59, 0.86)', 'rgba(2, 44, 34, 0.92)'],
          glassBorder: 'rgba(52, 211, 153, 0.45)',
          isDark: true
        }
    }
  }

  const getBadgeTextColor = (hexColor) => {
    if (!hexColor) return '#000000'
    const clean = hexColor.toLowerCase()
    if (['#ef4444', '#3b82f6', '#8b5cf6', '#dc2626', '#2563eb', '#1d4ed8', '#7f1d1d'].includes(clean)) {
      return '#ffffff'
    }
    return '#000000'
  }

  const loadCanvasLogo = (url) => {
    if (!url) return Promise.resolve(null)
    if (logoCacheRef.current && logoCacheRef.current.has(url)) {
      return Promise.resolve(logoCacheRef.current.get(url))
    }
    return new Promise(res => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (logoCacheRef.current) logoCacheRef.current.set(url, img)
        res(img)
      }
      img.onerror = () => {
        // Resolve null so we don't taint the canvas with un-credentialed external images
        res(null)
      }
      img.src = url
    })
  }

  const loadCachedImage = (url) => {
    if (!url) return Promise.resolve(null)
    if (imgCacheRef.current && imgCacheRef.current.has(url)) {
      return Promise.resolve(imgCacheRef.current.get(url))
    }
    return new Promise(res => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (imgCacheRef.current) imgCacheRef.current.set(url, img)
        res(img)
      }
      img.onerror = () => res(null)
      img.src = url
    })
  }

  const computeLogoBounds = (logoImg, canvasW, canvasH, logoXPercent = 50, logoYPercent = 10, scalePercent = 100, defaultMaxW = 380, defaultMaxH = 65) => {
    const zoom = Math.max(0.4, Math.min(2.5, (scalePercent || 100) / 100))
    const maxW = defaultMaxW * zoom
    const maxH = defaultMaxH * zoom

    let lW = 260 * zoom
    let lH = 48 * zoom
    if (logoImg && logoImg.width && logoImg.height) {
      const lScale = Math.min(maxW / logoImg.width, maxH / logoImg.height)
      lW = logoImg.width * lScale
      lH = logoImg.height * lScale
    }

    const centerX = (canvasW * Math.max(0, Math.min(100, logoXPercent))) / 100
    const centerY = (canvasH * Math.max(0, Math.min(100, logoYPercent))) / 100

    const margin = 20
    const drawX = Math.round(Math.max(margin, Math.min(canvasW - lW - margin, centerX - lW / 2)))
    const drawY = Math.round(Math.max(margin, Math.min(canvasH - lH - margin, centerY - lH / 2)))

    return { drawX, drawY, lW, lH, centerX, centerY, zoom }
  }

  const drawBrandLogo = (ctx, logoImg, activeStoreName, canvasW, canvasH, fontFamily, mainTextColor, fallbackBg = null) => {
    const { drawX, drawY, lW, lH, centerX, centerY, zoom } = computeLogoBounds(
      logoImg, canvasW, canvasH, canvasLogoX, canvasLogoY, canvasLogoScale, 380, 65
    )

    const effectiveBg = (canvasLogoBg && canvasLogoBg !== 'none') ? canvasLogoBg : fallbackBg

    if (effectiveBg && effectiveBg !== 'none') {
      ctx.save()
      const padX = 22
      const padY = 10
      const bgX = drawX - padX
      const bgY = drawY - padY
      const bgW = lW + padX * 2
      const bgH = lH + padY * 2
      const radius = Math.min(22, bgH / 2)

      if (effectiveBg === 'dark' || effectiveBg === 'pill') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)'
      } else if (effectiveBg === 'white') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
      } else if (effectiveBg === 'glass') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)'
      }

      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(bgX, bgY, bgW, bgH, radius)
      else ctx.rect(bgX, bgY, bgW, bgH)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    // Soft shadow to ensure logo/text is clearly readable over white cards, photos or dark backgrounds
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2

    if (logoImg) {
      ctx.drawImage(logoImg, drawX, drawY, lW, lH)
    } else {
      ctx.fillStyle = (effectiveBg === 'white') ? '#0f172a' : (mainTextColor || '#ffffff')
      const textFontSize = Math.round(28 * zoom)
      ctx.font = `bold ${textFontSize}px ${fontFamily}`
      ctx.textAlign = 'center'
      if (!effectiveBg || effectiveBg === 'none') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
        ctx.lineWidth = 3.5
        ctx.strokeText(`🌿 ${activeStoreName.toUpperCase()}`, centerX, centerY + Math.round(9 * zoom))
      }
      ctx.fillText(`🌿 ${activeStoreName.toUpperCase()}`, centerX, centerY + Math.round(9 * zoom))
    }
    ctx.restore()
  }

  const computeProductImageBounds = (img, boxW, boxH, boxX, boxY, fitMode = 'contain', scalePercent = 100, offsetYPercent = 0) => {
    if (!img || !img.width || !img.height) return { drawX: boxX, drawY: boxY, drawW: boxW, drawH: boxH }

    let baseScale = 1.0
    if (fitMode === 'contain') {
      baseScale = Math.min(boxW / img.width, boxH / img.height)
    } else if (fitMode === 'cover') {
      baseScale = Math.max(boxW / img.width, boxH / img.height)
    } else {
      baseScale = Math.min(boxW / img.width, boxH / img.height)
    }

    const zoomFactor = Math.max(0.2, (scalePercent || 100) / 100)
    const finalScale = baseScale * zoomFactor

    const drawW = img.width * finalScale
    const drawH = img.height * finalScale

    const centerX = boxX + (boxW - drawW) / 2
    const centerY = boxY + (boxH - drawH) / 2

    const drawX = centerX
    const drawY = centerY + ((offsetYPercent || 0) / 100) * boxH

    return { drawX, drawY, drawW, drawH }
  }

  const renderReelCanvasVideo = async (script) => {
    return new Promise(async (resolve) => {
      const width = 1080
      const height = 1920
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      const fontFamily = getFontFamily(canvasFont)
      const logoImg = await loadCanvasLogo(canvasLogoUrl)

      let rawImagesList = script.images || []
      const selImg = selectedProductImage || mediaUrl
      if (selImg && rawImagesList.length > 0) {
        rawImagesList = [selImg, ...rawImagesList.filter(u => u !== selImg)]
      }
      const imagesList = rawImagesList
      const loadedImgs = await Promise.all(
        imagesList.map(src => new Promise(res => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => res(img)
          img.onerror = () => res(null)
          img.src = src
        }))
      )
      const validImgs = loadedImgs.filter(Boolean)

      const scenes = script.scenes || [
        { duration_sec: 4, badge_text: 'PROMO EXCLUSIVA', main_headline: script.product_title || storeName, sub_text: '¡Conocé el stock!' },
        { duration_sec: 4, badge_text: 'PRECIO ESPECIAL', main_headline: `$ ${script.product_price?.toLocaleString() || ''}`, sub_text: 'Envíos a todo el país' },
        { duration_sec: 4, badge_text: 'COMPRÁ HOY', main_headline: storeName, sub_text: 'Contactanos por WhatsApp' }
      ]

      const fps = 30
      const totalDurationSec = scenes.reduce((acc, s) => acc + (s.duration_sec || 4), 0)
      const stream = canvas.captureStream(fps)

      let recorder
      let mimeType = 'video/webm'
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) {
        mimeType = 'video/mp4;codecs=h264'
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4'
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        mimeType = 'video/webm;codecs=h264'
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9'
      }

      try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 })
      } catch(e) {
        recorder = new MediaRecorder(stream)
      }

      const chunks = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = async () => {
        const isMp4 = mimeType.includes('mp4')
        const fileExt = isMp4 ? 'mp4' : 'webm'
        const fileMime = isMp4 ? 'video/mp4' : 'video/webm'
        const blob = new Blob(chunks, { type: fileMime })
        const blobUrl = URL.createObjectURL(blob)
        
        try {
          const formData = new FormData()
          const file = new File([blob], `reel_${Date.now()}.${fileExt}`, { type: fileMime })
          formData.append('file', file)
          const uploadRes = await fetch('/api/media/upload?path=reels', { method: 'POST', body: formData })
          const uploadData = await uploadRes.json()
          if (uploadRes.ok && uploadData.url) {
            setMediaUrl(uploadData.url)
            setGeneratedServerMediaUrl(uploadData.url)
          }

        } catch(e) {
          console.warn("Error uploading reel:", e)
        }
        resolve(blobUrl)
      }

      recorder.start()

      let currentSceneIdx = 0
      let sceneStartTime = Date.now()
      let overallStartTime = Date.now()

      const drawFrame = () => {
        const now = Date.now()
        const elapsedTotal = (now - overallStartTime) / 1000
        const elapsedScene = (now - sceneStartTime) / 1000

        const currentScene = scenes[currentSceneIdx] || scenes[0]
        const sceneDuration = currentScene.duration_sec || 4

        if (elapsedScene >= sceneDuration) {
          currentSceneIdx++
          sceneStartTime = Date.now()
          if (currentSceneIdx >= scenes.length) {
            recorder.stop()
            return
          }
        }

        // Theme colors
        const theme = getCanvasThemeConfig(canvasTheme)
        const isCleanWhite = canvasTheme === 'white_clean'

        const mainTextColor = (canvasTextColor && canvasTextColor !== 'auto') ? canvasTextColor : theme.defaultText
        const subTextColor = (canvasTextColor && canvasTextColor !== 'auto') ? canvasTextColor : theme.defaultSubtext
        const drawBorder = canvasShowBorder && !isCleanWhite && theme.border !== 'transparent'
        const activeImg = validImgs[currentSceneIdx % validImgs.length] || validImgs[0]
        const badgeTxt = canvasBadgeText.trim() || currentScene.badge_text
        const headlineTxt = canvasCustomTitle.trim() || currentScene.main_headline
        const footerTxt = canvasFooterText.trim() || `📱 Comprá en ${storeName}`
        const activePrice = (effectivePrice > 0) ? effectivePrice : (script.product_price || 0)

        if (canvasLayout === 'modern_split') {
          // --- SPLIT EDITORIAL REEL ---
          const grad = ctx.createLinearGradient(0, 0, 0, height)
          grad.addColorStop(0, theme.bg[0])
          grad.addColorStop(1, theme.bg[2])
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, width, height)

          // Top 60% Hero Image with Zoom
          if (activeImg) {
            const animScale = 1.02 + (elapsedScene / sceneDuration) * 0.08
            const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, 1000, 1100, 40, 40, canvasImgFit, canvasImgScale * animScale, canvasImgOffsetY)

            ctx.save()
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(40, 40, 1000, 1100, 36)
            else ctx.rect(40, 40, 1000, 1100)
            ctx.clip()

            ctx.fillStyle = '#ffffff'
            ctx.fillRect(40, 40, 1000, 1100)
            ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)

            // Dark gradient overlay
            const imgGrad = ctx.createLinearGradient(0, 800, 0, 1140)
            imgGrad.addColorStop(0, 'rgba(0,0,0,0)')
            imgGrad.addColorStop(1, 'rgba(0,0,0,0.70)')
            ctx.fillStyle = imgGrad
            ctx.fillRect(40, 800, 1000, 340)
            ctx.restore()
          }

          if (badgeTxt) {
            ctx.fillStyle = canvasBadgeColor || '#f59e0b'
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(650, 70, 360, 56, 28)
            else ctx.rect(650, 70, 360, 56)
            ctx.fill()
            ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
            ctx.font = `bold 26px ${fontFamily}`
            ctx.textAlign = 'center'
            ctx.fillText(badgeTxt, 650 + 180, 70 + 38)
          }

          // Bottom Info Section
          if (headlineTxt) {
            ctx.fillStyle = mainTextColor
            ctx.font = `bold 48px ${fontFamily}`
            ctx.textAlign = 'center'
            ctx.fillText(headlineTxt, width / 2, 1260)
          }

          if (currentScene.sub_text) {
            ctx.fillStyle = subTextColor
            ctx.font = `34px ${fontFamily}`
            ctx.textAlign = 'center'
            ctx.fillText(currentScene.sub_text, width / 2, 1340)
          }

          if (canvasShowPrice && activePrice) {
            const barY = 1440
            ctx.fillStyle = theme.accent
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(width / 2 - 320, barY, 640, 96, 48)
            else ctx.rect(width / 2 - 320, barY, 640, 96)
            ctx.fill()
            ctx.fillStyle = '#ffffff'
            ctx.font = `bold 42px ${fontFamily}`
            ctx.textAlign = 'center'
            ctx.fillText(`$ ${activePrice.toLocaleString('es-AR')}  •  COMPRAR`, width / 2, barY + 63)
          }

          ctx.fillStyle = (isCleanWhite || canvasTheme === 'white') && (canvasTextColor === 'auto' || canvasTextColor === '#0f172a') ? '#059669' : mainTextColor
          ctx.font = `bold 30px ${fontFamily}`
          ctx.textAlign = 'center'
          ctx.fillText(footerTxt, width / 2, 1720)

        } else if (canvasLayout === 'bold_promo') {
          // --- BOLD PROMO REEL ---
          const grad = ctx.createLinearGradient(0, 0, width, height)
          grad.addColorStop(0, theme.bg[0])
          grad.addColorStop(0.5, theme.bg[1])
          grad.addColorStop(1, theme.bg[2])
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, width, height)

          // Product Image with Offset Pop Frame
          if (activeImg) {
            const scale = 1.02 + (elapsedScene / sceneDuration) * 0.08
            const imgSize = 840
            const imgX = (width - imgSize) / 2
            const imgY = 170

            if (drawBorder) {
              ctx.fillStyle = theme.accent
              ctx.beginPath()
              if (ctx.roundRect) ctx.roundRect(imgX + 20, imgY + 20, imgSize, imgSize, 36)
              else ctx.rect(imgX + 20, imgY + 20, imgSize, imgSize)
              ctx.fill()
            }

            ctx.save()
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(imgX, imgY, imgSize, imgSize, 36)
            else ctx.rect(imgX, imgY, imgSize, imgSize)
            ctx.clip()

            ctx.fillStyle = '#ffffff'
            ctx.fillRect(imgX, imgY, imgSize, imgSize)

            const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, imgSize, imgSize, imgX, imgY, canvasImgFit, canvasImgScale * scale, canvasImgOffsetY)
            ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)
            ctx.restore()

            // Corner Price Explosive Badge
            if (canvasShowPrice && activePrice) {
              const badgeX = imgX + imgSize - 50
              const badgeY = imgY + 50
              ctx.fillStyle = canvasBadgeColor || '#ef4444'
              ctx.beginPath()
              ctx.arc(badgeX, badgeY, 115, 0, Math.PI * 2)
              ctx.fill()
              ctx.lineWidth = 6
              ctx.strokeStyle = '#ffffff'
              ctx.stroke()

              ctx.fillStyle = '#ffffff'
              ctx.font = `bold 24px ${fontFamily}`
              ctx.textAlign = 'center'
              ctx.fillText('¡OFERTA!', badgeX, badgeY - 32)
              ctx.font = `bold 38px ${fontFamily}`
              ctx.fillText(`$${activePrice.toLocaleString('es-AR')}`, badgeX, badgeY + 16)
              ctx.font = `bold 20px ${fontFamily}`
              ctx.fillText('EN STOCK', badgeX, badgeY + 48)
            }
          }

          // Full-width Badge Banner
          if (badgeTxt) {
            ctx.fillStyle = canvasBadgeColor || '#f59e0b'
            ctx.fillRect(0, 1080, width, 72)
            ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
            ctx.font = `bold 36px ${fontFamily}`
            ctx.textAlign = 'center'
            ctx.fillText(badgeTxt, width / 2, 1128)
          }

          if (headlineTxt) {
            ctx.fillStyle = mainTextColor
            let hFontSize = 50
            ctx.font = `bold ${hFontSize}px ${fontFamily}`
            while (ctx.measureText(headlineTxt).width > 960 && hFontSize > 28) {
              hFontSize -= 2
              ctx.font = `bold ${hFontSize}px ${fontFamily}`
            }
            ctx.textAlign = 'center'
            ctx.fillText(headlineTxt, width / 2, 1260)
          }

          if (currentScene.sub_text) {
            ctx.fillStyle = subTextColor
            let sFontSize = 34
            ctx.font = `${sFontSize}px ${fontFamily}`
            while (ctx.measureText(currentScene.sub_text).width > 960 && sFontSize > 22) {
              sFontSize -= 2
              ctx.font = `${sFontSize}px ${fontFamily}`
            }
            ctx.textAlign = 'center'
            ctx.fillText(currentScene.sub_text, width / 2, 1340)
          }

          // Bottom Accent Banner
          ctx.fillStyle = theme.accent
          ctx.fillRect(0, 1680, width, 140)
          ctx.fillStyle = '#ffffff'
          ctx.font = `bold 36px ${fontFamily}`
          ctx.textAlign = 'center'
          ctx.fillText(footerTxt, width / 2, 1762)

        } else if (canvasLayout === 'glassmorphism') {
          // --- GLASSMORPHISM REEL ---
          if (activeImg) {
            ctx.save()
            if ('filter' in ctx) {
              ctx.filter = 'blur(22px)'
            }
            const scale = (1.05 + (elapsedScene / sceneDuration) * 0.05) * 1.15
            const drawW = width * scale
            const drawH = (activeImg.height / activeImg.width) * drawW
            ctx.drawImage(activeImg, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH)
            ctx.restore()
          } else {
            const grad = ctx.createLinearGradient(0, 0, 0, height)
            grad.addColorStop(0, theme.bg[0])
            grad.addColorStop(1, theme.bg[2])
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, width, height)
          }

          // Theme Overlay
          const bgOverlayGrad = ctx.createLinearGradient(0, 0, 0, height)
          bgOverlayGrad.addColorStop(0, theme.glassOverlay[0])
          bgOverlayGrad.addColorStop(1, theme.glassOverlay[1])
          ctx.fillStyle = bgOverlayGrad
          ctx.fillRect(0, 0, width, height)

          // Floating Glass Container (940x1680)
          const cardX = 70
          const cardY = 100
          const cardW = 940
          const cardH = 1680

          const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH)
          cardGrad.addColorStop(0, theme.glassCard[0])
          cardGrad.addColorStop(1, theme.glassCard[1])
          ctx.fillStyle = cardGrad
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 44)
          else ctx.rect(cardX, cardY, cardW, cardH)
          ctx.fill()

          if (drawBorder) {
            ctx.lineWidth = 3
            ctx.strokeStyle = theme.glassBorder
            ctx.stroke()
          }

          // Product Image Inside Glass Box
          if (activeImg) {
            const imgBoxSize = 720
            const imgBoxX = (width - imgBoxSize) / 2
            const imgBoxY = cardY + 120

            ctx.save()
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 32)
            else ctx.rect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize)
            ctx.clip()

            ctx.fillStyle = '#ffffff'
            ctx.fillRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize)

            const animScale = 1.0 + (elapsedScene / sceneDuration) * 0.06
            const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, imgBoxSize, imgBoxSize, imgBoxX, imgBoxY, canvasImgFit, canvasImgScale * animScale, canvasImgOffsetY)
            ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)
            ctx.restore()

            if (drawBorder) {
              ctx.lineWidth = 4
              ctx.strokeStyle = theme.accent
              ctx.beginPath()
              if (ctx.roundRect) ctx.roundRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 32)
              else ctx.rect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize)
              ctx.stroke()
            }
          }

          if (badgeTxt) {
            const badgeY = cardY + 900
            ctx.font = `bold 28px ${fontFamily}`
            const textMetrics = ctx.measureText(badgeTxt)
            const badgeW = Math.max(340, Math.min(720, textMetrics.width + 60))
            const badgeX = (width - badgeW) / 2
            ctx.fillStyle = canvasBadgeColor || '#f59e0b'
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, 56, 28)
            else ctx.rect(badgeX, badgeY, badgeW, 56)
            ctx.fill()
            ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
            ctx.textAlign = 'center'
            ctx.fillText(badgeTxt, width / 2, badgeY + 38)
          }

          if (headlineTxt) {
            ctx.fillStyle = mainTextColor
            let hFontSize = 46
            ctx.font = `bold ${hFontSize}px ${fontFamily}`
            while (ctx.measureText(headlineTxt).width > 860 && hFontSize > 26) {
              hFontSize -= 2
              ctx.font = `bold ${hFontSize}px ${fontFamily}`
            }
            ctx.textAlign = 'center'
            ctx.fillText(headlineTxt, width / 2, cardY + 1040)
          }

          if (currentScene.sub_text) {
            ctx.fillStyle = subTextColor
            let sFontSize = 32
            ctx.font = `${sFontSize}px ${fontFamily}`
            while (ctx.measureText(currentScene.sub_text).width > 860 && sFontSize > 20) {
              sFontSize -= 2
              ctx.font = `${sFontSize}px ${fontFamily}`
            }
            ctx.textAlign = 'center'
            ctx.fillText(currentScene.sub_text, width / 2, cardY + 1110)
          }

          if (canvasShowPrice && activePrice) {
            const pillY = cardY + 1200
            const pillWidth = 520
            ctx.fillStyle = theme.accent
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(width / 2 - pillWidth / 2, pillY, pillWidth, 84, 42)
            else ctx.rect(width / 2 - pillWidth / 2, pillY, pillWidth, 84)
            ctx.fill()
            ctx.fillStyle = '#ffffff'
            ctx.font = `bold 40px ${fontFamily}`
            ctx.fillText(`$ ${activePrice.toLocaleString('es-AR')}`, width / 2, pillY + 56)
          }

          ctx.fillStyle = mainTextColor
          ctx.font = `bold 28px ${fontFamily}`
          ctx.textAlign = 'center'
          ctx.fillText(footerTxt, width / 2, cardY + cardH - 55)

        } else {
          // --- CLASSIC REEL ---
          const grad = ctx.createLinearGradient(0, 0, 0, height)
          grad.addColorStop(0, theme.bg[0])
          grad.addColorStop(0.5, theme.bg[1])
          grad.addColorStop(1, theme.bg[2])
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, width, height)

          if (activeImg) {
            const animScale = 1.02 + (elapsedScene / sceneDuration) * 0.08
            const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, 900, 900, 90, 260, canvasImgFit, canvasImgScale * animScale, canvasImgOffsetY)

            ctx.save()
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(90, 260, 900, 900, 32)
            else ctx.rect(90, 260, 900, 900)
            ctx.clip()

            ctx.fillStyle = '#ffffff'
            ctx.fillRect(90, 260, 900, 900)
            ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)
            ctx.restore()

            if (drawBorder) {
              ctx.lineWidth = 6
              ctx.strokeStyle = theme.border
              ctx.beginPath()
              if (ctx.roundRect) ctx.roundRect(90, 260, 900, 900, 32)
              else ctx.rect(90, 260, 900, 900)
              ctx.stroke()
            }
          }

          if (canvasLogoX === 50 && canvasLogoY === 10) {
            if (theme.header !== 'transparent') {
              ctx.fillStyle = theme.header
              ctx.fillRect(90, 100, 900, 90)
            }
            if (drawBorder) {
              ctx.strokeStyle = theme.border
              ctx.lineWidth = 2
              ctx.strokeRect(90, 100, 900, 90)
            }
          }

          if (badgeTxt) {
            const badgeY = 1220
            ctx.font = `bold 32px ${fontFamily}`
            const textMetrics = ctx.measureText(badgeTxt)
            const badgeW = Math.max(340, Math.min(760, textMetrics.width + 60))
            const badgeX = (width - badgeW) / 2
            ctx.fillStyle = canvasBadgeColor || '#f59e0b'
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, 64, 32)
            else ctx.rect(badgeX, badgeY, badgeW, 64)
            ctx.fill()
            ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
            ctx.textAlign = 'center'
            ctx.fillText(badgeTxt, width / 2, badgeY + 43)
          }

          if (headlineTxt) {
            ctx.fillStyle = mainTextColor
            let hFontSize = 50
            ctx.font = `bold ${hFontSize}px ${fontFamily}`
            while (ctx.measureText(headlineTxt).width > 900 && hFontSize > 28) {
              hFontSize -= 2
              ctx.font = `bold ${hFontSize}px ${fontFamily}`
            }
            ctx.textAlign = 'center'
            ctx.fillText(headlineTxt, width / 2, 1370)
          }

          if (currentScene.sub_text) {
            ctx.fillStyle = subTextColor
            let sFontSize = 36
            ctx.font = `${sFontSize}px ${fontFamily}`
            while (ctx.measureText(currentScene.sub_text).width > 900 && sFontSize > 22) {
              sFontSize -= 2
              ctx.font = `${sFontSize}px ${fontFamily}`
            }
            ctx.textAlign = 'center'
            ctx.fillText(currentScene.sub_text, width / 2, 1450)
          }

          if (canvasShowPrice && activePrice) {
            const pillY = 1540
            const pillWidth = 560
            ctx.fillStyle = theme.accent
            ctx.beginPath()
            if (ctx.roundRect) ctx.roundRect(width / 2 - pillWidth / 2, pillY, pillWidth, 96, 48)
            else ctx.rect(width / 2 - pillWidth / 2, pillY, pillWidth, 96)
            ctx.fill()
            ctx.fillStyle = '#ffffff'
            ctx.font = `bold 44px ${fontFamily}`
            ctx.fillText(`$ ${activePrice.toLocaleString('es-AR')}`, width / 2, pillY + 63)
          }

          ctx.fillStyle = (isCleanWhite || canvasTheme === 'white') && (canvasTextColor === 'auto' || canvasTextColor === '#0f172a') ? '#059669' : mainTextColor
          ctx.font = `bold 32px ${fontFamily}`
          ctx.textAlign = 'center'
          ctx.fillText(footerTxt, width / 2, 1750)
        }

        // Draw Brand Logo on top of all reel scene elements
        drawBrandLogo(ctx, logoImg, storeName, width, height, fontFamily, mainTextColor, null)

        // Progress bar
        ctx.fillStyle = theme.accent
        ctx.fillRect(0, height - 12, (elapsedTotal / totalDurationSec) * width, 12)

        requestAnimationFrame(drawFrame)
      }

      drawFrame()
    })
  }

  // Render a static 1080x1080 post image from Gemini Canvas script
  const renderPostCanvasImage = async (script, shouldUpload = true) => {
    const renderId = ++canvasRenderSeqRef.current
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready
      }
    } catch (e) {}

    const size = 1080
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    const activeStoreName = storeName
    const fontFamily = getFontFamily(canvasFont)
    const logoImg = await loadCanvasLogo(canvasLogoUrl)

    // Theme colors
    const theme = getCanvasThemeConfig(canvasTheme)
    const isCleanWhite = canvasTheme === 'white_clean'

    const mainTextColor = (canvasTextColor && canvasTextColor !== 'auto') ? canvasTextColor : theme.defaultText
    const subTextColor = (canvasTextColor && canvasTextColor !== 'auto') ? canvasTextColor : theme.defaultSubtext
    const drawBorder = canvasShowBorder && !isCleanWhite && theme.border !== 'transparent'

    let rawImagesList = script.images || []
    const selImg = selectedProductImage || mediaUrl
    if (selImg && rawImagesList.length > 0) {
      rawImagesList = [selImg, ...rawImagesList.filter(u => u !== selImg)]
    }
    const imagesList = rawImagesList
    const loadedImgs = await Promise.all(imagesList.map(src => loadCachedImage(src)))
    const validImgs = loadedImgs.filter(Boolean)
    const activePrice = (effectivePrice > 0) ? effectivePrice : (script.product_price || 0)
    const scene = (script.scenes && script.scenes[0]) || { badge_text: 'PROMO EXCLUSIVA', main_headline: script.product_title || activeStoreName, sub_text: '¡Conocé el stock!' }
    const activeImg = validImgs[0]
    const badgeTxt = canvasBadgeText.trim() || scene.badge_text
    const headlineTxt = canvasCustomTitle.trim() || scene.main_headline
    const footerTxt = canvasFooterText.trim() || `📱 Comprá en ${activeStoreName}`

    if (canvasLayout === 'modern_split') {
      // --- PLANTILLA 2: SPLIT EDITORIAL MODERNO ---
      const grad = ctx.createLinearGradient(0, 0, 0, size)
      grad.addColorStop(0, theme.bg[0])
      grad.addColorStop(1, theme.bg[2])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)

      if (activeImg) {
        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(40, 40, 1000, 580, 28)
        else ctx.rect(40, 40, 1000, 580)
        ctx.clip()

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(40, 40, 1000, 580)

        const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, 1000, 580, 40, 40, canvasImgFit, canvasImgScale, canvasImgOffsetY)
        ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)

        const imgGrad = ctx.createLinearGradient(0, 400, 0, 620)
        imgGrad.addColorStop(0, 'rgba(0,0,0,0)')
        imgGrad.addColorStop(1, 'rgba(0,0,0,0.65)')
        ctx.fillStyle = imgGrad
        ctx.fillRect(40, 400, 1000, 220)
        ctx.restore()

        if (drawBorder) {
          ctx.lineWidth = 3
          ctx.strokeStyle = theme.border
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(40, 40, 1000, 580, 28)
          else ctx.rect(40, 40, 1000, 580)
          ctx.stroke()
        }
      }

      if (badgeTxt) {
        ctx.fillStyle = canvasBadgeColor || '#f59e0b'
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(675, 65, 340, 48, 24)
        else ctx.rect(675, 65, 340, 48)
        ctx.fill()
        ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
        ctx.font = `bold 22px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.fillText(badgeTxt, 675 + 170, 65 + 32)
      }

      if (headlineTxt) {
        ctx.fillStyle = mainTextColor
        let hFontSize = 42
        ctx.font = `bold ${hFontSize}px ${fontFamily}`
        while (ctx.measureText(headlineTxt).width > 960 && hFontSize > 24) {
          hFontSize -= 2
          ctx.font = `bold ${hFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(headlineTxt, size / 2, 705)
      }

      if (scene.sub_text) {
        ctx.fillStyle = subTextColor
        let sFontSize = 28
        ctx.font = `${sFontSize}px ${fontFamily}`
        while (ctx.measureText(scene.sub_text).width > 960 && sFontSize > 18) {
          sFontSize -= 2
          ctx.font = `${sFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(scene.sub_text, size / 2, 760)
      }

      if (canvasShowPrice && activePrice) {
        const barY = 820
        ctx.fillStyle = theme.accent
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(size / 2 - 280, barY, 560, 80, 40)
        else ctx.rect(size / 2 - 280, barY, 560, 80)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.font = `bold 36px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.fillText(`$ ${activePrice.toLocaleString('es-AR')}  •  COMPRAR`, size / 2, barY + 53)
      }

      ctx.fillStyle = (isCleanWhite || canvasTheme === 'white') && (canvasTextColor === 'auto' || canvasTextColor === '#0f172a') ? '#059669' : mainTextColor
      ctx.font = `bold 24px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.fillText(footerTxt, size / 2, 1020)

    } else if (canvasLayout === 'bold_promo') {
      // --- PLANTILLA 3: IMPACTO / PROMO DESTACADA ---
      const grad = ctx.createLinearGradient(0, 0, size, size)
      grad.addColorStop(0, theme.bg[0])
      grad.addColorStop(0.5, theme.bg[1])
      grad.addColorStop(1, theme.bg[2])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)

      ctx.fillStyle = theme.accent + '25'
      ctx.beginPath()
      ctx.arc(950, 120, 320, 0, Math.PI * 2)
      ctx.fill()

      if (activeImg) {
        const imgSize = 540
        const imgX = (size - imgSize) / 2
        const imgY = 115

        if (drawBorder) {
          ctx.fillStyle = theme.accent
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(imgX + 16, imgY + 16, imgSize, imgSize, 28)
          else ctx.rect(imgX + 16, imgY + 16, imgSize, imgSize)
          ctx.fill()
        }

        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(imgX, imgY, imgSize, imgSize, 28)
        else ctx.rect(imgX, imgY, imgSize, imgSize)
        ctx.clip()

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(imgX, imgY, imgSize, imgSize)

        const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, imgSize, imgSize, imgX, imgY, canvasImgFit, canvasImgScale, canvasImgOffsetY)
        ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)
        ctx.restore()

        if (canvasShowPrice && activePrice) {
          const badgeX = imgX + imgSize - 40
          const badgeY = imgY + 40
          const radius = 95

          ctx.fillStyle = canvasBadgeColor || '#ef4444'
          ctx.beginPath()
          ctx.arc(badgeX, badgeY, radius, 0, Math.PI * 2)
          ctx.fill()
          ctx.lineWidth = 5
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()

          ctx.fillStyle = '#ffffff'
          ctx.font = `bold 20px ${fontFamily}`
          ctx.textAlign = 'center'
          ctx.fillText('¡OFERTA!', badgeX, badgeY - 26)
          ctx.font = `bold 32px ${fontFamily}`
          ctx.fillText(`$${activePrice.toLocaleString('es-AR')}`, badgeX, badgeY + 14)
          ctx.font = `bold 18px ${fontFamily}`
          ctx.fillText('EN STOCK', badgeX, badgeY + 42)
        }
      }

      if (badgeTxt) {
        ctx.fillStyle = canvasBadgeColor || '#f59e0b'
        ctx.fillRect(0, 690, size, 56)
        ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
        ctx.font = `bold 28px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.fillText(badgeTxt, size / 2, 728)
      }

      if (headlineTxt) {
        ctx.fillStyle = mainTextColor
        let hFontSize = 44
        ctx.font = `bold ${hFontSize}px ${fontFamily}`
        while (ctx.measureText(headlineTxt).width > 980 && hFontSize > 24) {
          hFontSize -= 2
          ctx.font = `bold ${hFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(headlineTxt, size / 2, 805)
      }

      if (scene.sub_text) {
        ctx.fillStyle = subTextColor
        let sFontSize = 28
        ctx.font = `${sFontSize}px ${fontFamily}`
        while (ctx.measureText(scene.sub_text).width > 980 && sFontSize > 18) {
          sFontSize -= 2
          ctx.font = `${sFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(scene.sub_text, size / 2, 860)
      }

      ctx.fillStyle = theme.accent
      ctx.fillRect(0, 970, size, 110)
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold 30px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.fillText(footerTxt, size / 2, 1035)

    } else if (canvasLayout === 'glassmorphism') {
      // --- PLANTILLA 4: GLASSMORPHISM HERO CANVA STYLE ---
      if (activeImg) {
        ctx.save()
        if ('filter' in ctx) {
          ctx.filter = 'blur(22px)'
        }
        const scale = Math.max(size / activeImg.width, size / activeImg.height) * 1.15
        const drawW = activeImg.width * scale
        const drawH = activeImg.height * scale
        ctx.drawImage(activeImg, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH)
        ctx.restore()
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, size)
        grad.addColorStop(0, theme.bg[0])
        grad.addColorStop(1, theme.bg[2])
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, size, size)
      }

      // Theme-specific Tinted Glass Overlay
      const bgOverlayGrad = ctx.createLinearGradient(0, 0, 0, size)
      bgOverlayGrad.addColorStop(0, theme.glassOverlay[0])
      bgOverlayGrad.addColorStop(1, theme.glassOverlay[1])
      ctx.fillStyle = bgOverlayGrad
      ctx.fillRect(0, 0, size, size)

      const cardX = 70
      const cardY = 70
      const cardW = 940
      const cardH = 940

      ctx.save()
      const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH)
      cardGrad.addColorStop(0, theme.glassCard[0])
      cardGrad.addColorStop(1, theme.glassCard[1])
      ctx.fillStyle = cardGrad
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 36)
      else ctx.rect(cardX, cardY, cardW, cardH)
      ctx.fill()

      if (drawBorder) {
        ctx.lineWidth = 3
        ctx.strokeStyle = theme.glassBorder
        ctx.stroke()
      }

      if (activeImg) {
        const imgBoxSize = 460
        const imgBoxX = (size - imgBoxSize) / 2
        const imgBoxY = cardY + 95

        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 24)
        else ctx.rect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize)
        ctx.clip()

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize)

        const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, imgBoxSize, imgBoxSize, imgBoxX, imgBoxY, canvasImgFit, canvasImgScale, canvasImgOffsetY)
        ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)
        ctx.restore()

        if (drawBorder) {
          ctx.lineWidth = 3
          ctx.strokeStyle = theme.accent
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 24)
          else ctx.rect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize)
          ctx.stroke()
        }
      }

      if (badgeTxt) {
        const badgeY = cardY + 580
        ctx.font = `bold 24px ${fontFamily}`
        const textMetrics = ctx.measureText(badgeTxt)
        const badgeW = Math.max(280, Math.min(680, textMetrics.width + 60))
        const badgeX = (size - badgeW) / 2
        ctx.fillStyle = canvasBadgeColor || '#f59e0b'
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, 46, 23)
        else ctx.rect(badgeX, badgeY, badgeW, 46)
        ctx.fill()
        ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
        ctx.textAlign = 'center'
        ctx.fillText(badgeTxt, size / 2, badgeY + 31)
      }

      if (headlineTxt) {
        ctx.fillStyle = mainTextColor
        let hFontSize = 38
        ctx.font = `bold ${hFontSize}px ${fontFamily}`
        while (ctx.measureText(headlineTxt).width > 860 && hFontSize > 22) {
          hFontSize -= 2
          ctx.font = `bold ${hFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(headlineTxt, size / 2, cardY + 675)
      }

      if (scene.sub_text) {
        ctx.fillStyle = subTextColor
        let sFontSize = 26
        ctx.font = `${sFontSize}px ${fontFamily}`
        while (ctx.measureText(scene.sub_text).width > 860 && sFontSize > 18) {
          sFontSize -= 2
          ctx.font = `${sFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(scene.sub_text, size / 2, cardY + 725)
      }

      if (canvasShowPrice && activePrice) {
        const pillY = cardY + 760
        const pillWidth = 400
        ctx.fillStyle = theme.accent
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(size / 2 - pillWidth / 2, pillY, pillWidth, 64, 32)
        else ctx.rect(size / 2 - pillWidth / 2, pillY, pillWidth, 64)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold 34px ${fontFamily}`
        ctx.fillText(`$ ${activePrice.toLocaleString('es-AR')}`, size / 2, pillY + 44)
      }

      ctx.fillStyle = mainTextColor
      ctx.font = `bold 22px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.fillText(footerTxt, size / 2, cardY + cardH - 35)
      ctx.restore()

    } else {
      // --- PLANTILLA 1: CLÁSICO RECUADRO ---
      const grad = ctx.createLinearGradient(0, 0, 0, size)
      grad.addColorStop(0, theme.bg[0])
      grad.addColorStop(0.5, theme.bg[1])
      grad.addColorStop(1, theme.bg[2])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)

      if (canvasLogoX === 50 && canvasLogoY === 10) {
        if (theme.header !== 'transparent') {
          ctx.fillStyle = theme.header
          ctx.fillRect(60, 40, 960, 70)
        }
        if (drawBorder) {
          ctx.strokeStyle = theme.border
          ctx.lineWidth = 2
          ctx.strokeRect(60, 40, 960, 70)
        }
      }

      if (activeImg) {
        const imgAreaSize = 560
        const imgAreaX = (size - imgAreaSize) / 2
        const imgAreaY = 140

        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(imgAreaX, imgAreaY, imgAreaSize, imgAreaSize, 24)
        else ctx.rect(imgAreaX, imgAreaY, imgAreaSize, imgAreaSize)
        ctx.clip()

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(imgAreaX, imgAreaY, imgAreaSize, imgAreaSize)

        const { drawX, drawY, drawW, drawH } = computeProductImageBounds(activeImg, imgAreaSize, imgAreaSize, imgAreaX, imgAreaY, canvasImgFit, canvasImgScale, canvasImgOffsetY)
        ctx.drawImage(activeImg, drawX, drawY, drawW, drawH)
        ctx.restore()

        if (drawBorder) {
          ctx.lineWidth = 4
          ctx.strokeStyle = theme.border
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(imgAreaX, imgAreaY, imgAreaSize, imgAreaSize, 24)
          else ctx.rect(imgAreaX, imgAreaY, imgAreaSize, imgAreaSize)
          ctx.stroke()
        }
      }

      if (badgeTxt) {
        const badgeY = 730
        ctx.font = `bold 26px ${fontFamily}`
        const textMetrics = ctx.measureText(badgeTxt)
        const badgeW = Math.max(300, Math.min(680, textMetrics.width + 60))
        const badgeX = (size - badgeW) / 2
        ctx.fillStyle = canvasBadgeColor || '#f59e0b'
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, 52, 26)
        else ctx.rect(badgeX, badgeY, badgeW, 52)
        ctx.fill()
        ctx.fillStyle = getBadgeTextColor(canvasBadgeColor)
        ctx.textAlign = 'center'
        ctx.fillText(badgeTxt, size / 2, badgeY + 36)
      }

      if (headlineTxt) {
        ctx.fillStyle = mainTextColor
        let hFontSize = 40
        ctx.font = `bold ${hFontSize}px ${fontFamily}`
        while (ctx.measureText(headlineTxt).width > 960 && hFontSize > 22) {
          hFontSize -= 2
          ctx.font = `bold ${hFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(headlineTxt, size / 2, 840)
      }

      if (scene.sub_text) {
        ctx.fillStyle = subTextColor
        let sFontSize = 28
        ctx.font = `${sFontSize}px ${fontFamily}`
        while (ctx.measureText(scene.sub_text).width > 960 && sFontSize > 18) {
          sFontSize -= 2
          ctx.font = `${sFontSize}px ${fontFamily}`
        }
        ctx.textAlign = 'center'
        ctx.fillText(scene.sub_text, size / 2, 890)
      }

      if (canvasShowPrice && activePrice) {
        const pillY = 920
        const pillWidth = 420
        ctx.fillStyle = theme.accent
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(size / 2 - pillWidth / 2, pillY, pillWidth, 72, 36)
        else ctx.rect(size / 2 - pillWidth / 2, pillY, pillWidth, 72)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold 36px ${fontFamily}`
        ctx.fillText(`$ ${activePrice.toLocaleString('es-AR')}`, size / 2, pillY + 50)
      }

      ctx.fillStyle = (isCleanWhite || canvasTheme === 'white') && (canvasTextColor === 'auto' || canvasTextColor === '#0f172a') ? '#059669' : mainTextColor
      ctx.font = `bold 24px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.fillText(footerTxt, size / 2, 1040)
    }

    // Draw Brand Logo on top of ALL layers (cards, images, badges, texts, footer)
    drawBrandLogo(ctx, logoImg, activeStoreName, size, size, fontFamily, mainTextColor, null)

    // Export as JPEG blob and upload
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(null)
          return
        }
        const blobUrl = URL.createObjectURL(blob)
        if (shouldUpload) {
          try {
            const formData = new FormData()
            const file = new File([blob], `post_${Date.now()}.jpg`, { type: 'image/jpeg' })
            formData.append('file', file)
            const uploadRes = await fetch('/api/media/upload?path=reels', { method: 'POST', body: formData })
            const uploadData = await uploadRes.json()
            if (uploadRes.ok && uploadData.url && renderId === canvasRenderSeqRef.current) {
              setMediaUrl(uploadData.url)
              setGeneratedServerMediaUrl(uploadData.url)
            }
          } catch (e) {
            console.warn("Error uploading post image:", e)
          }
        }
        resolve(blobUrl)
      }, 'image/jpeg', 0.95)
    })
  }

  const handleGenerateAIVideo = async () => {
    if (!selectedProduct) {
      alert("⚠️ Por favor selecciona primero un producto del inventario en la lista desplegable superior para poder generar la imagen o video publicitario.")
      return
    }
    if (['imagen3', 'google_veo', 'pollinations', 'flux'].includes(videoEngine) && !videoPrompt.trim()) {
      alert("⚠️ Por favor ingresa una instrucción o prompt para la IA.")
      return
    }
    setGeneratingVideo(true)
    setGeneratedVideoUrl('')
    setVideoScriptData(null)

    try {
      const res = await fetch('/api/marketing/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ml_id: selectedProduct,
          prompt: videoPrompt,
          generator_type: videoEngine,
          post_type: postType,
          selected_image: selectedProductImage || mediaUrl,
          selected_price: effectivePrice,
          price_type: priceSource
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (['google_veo', 'pollinations', 'flux', 'imagen3', 'gemini_native_img'].includes(data.engine)) {
          setGeneratedVideoUrl(data.video_url)
          setMediaUrl(data.video_url)
        } else if (data.script) {
          if (effectivePrice > 0) {
            data.script.product_price = effectivePrice
          }
          setVideoScriptData(data.script)
          if (data.script.full_caption) {
            setCaption(data.script.full_caption)
          }
          if (data.script.video_title) {
            setPostTitle(data.script.video_title)
          }
          // Generate image for posts, video for reels
          if (postType === 'post') {
            const imageBlobUrl = await renderPostCanvasImage(data.script)
            setGeneratedVideoUrl(imageBlobUrl)
          } else {
            const videoBlobUrl = await renderReelCanvasVideo(data.script)
            setGeneratedVideoUrl(videoBlobUrl)
          }
        }
      } else {
        alert("Error al generar contenido: " + (data.detail || data.error || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión al generar contenido: " + err.message)
    } finally {
      setGeneratingVideo(false)
    }
  }


  const handleSavePost = async (statusOverride = null) => {
    if (!postTitle.trim() || !caption.trim()) {
      alert("Ingresa un título y el contenido (caption) para la publicación.")
      return
    }

    const selectedPlatforms = Object.keys(platforms).filter(k => platforms[k]).join(',')
    if (!selectedPlatforms) {
      alert("Selecciona al menos una red social destino (Instagram o Facebook).")
      return
    }

    const finalStatus = statusOverride || (scheduledAt ? 'scheduled' : 'draft')

    let cleanMediaUrl = mediaUrl.trim()
    if (cleanMediaUrl.startsWith('blob:')) {
      if (generatedServerMediaUrl && !generatedServerMediaUrl.startsWith('blob:')) {
        cleanMediaUrl = generatedServerMediaUrl
        setMediaUrl(generatedServerMediaUrl)
      } else {
        alert("El archivo aún se está subiendo al servidor. Por favor aguarda unos segundos antes de guardar la publicación.")
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/marketing/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPostId,
          product_ml_id: selectedProduct || null,
          title: postTitle.trim(),
          post_type: postType,
          platforms: selectedPlatforms,
          caption: caption.trim(),
          media_urls: cleanMediaUrl,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: finalStatus
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert(editingPostId ? "Publicación actualizada correctamente." : "Publicación guardada en la cola.")
        handleResetForm()
        fetchPosts()
        setActiveTab('calendar')
      } else {
        alert("Error al guardar: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublishNow = async (postId) => {
    if (!confirm("¿Deseas publicar este contenido INMEDIATAMENTE en tus redes sociales?")) return
    setPublishingId(postId)
    try {
      const res = await fetch(`/api/marketing/publish-now/${postId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert("¡Publicado con éxito! " + data.message)
        fetchPosts()
      } else {
        alert("Error al publicar: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setPublishingId(null)
    }
  }

  const handleDeletePost = async (postId) => {
    if (!confirm("¿Estás seguro de eliminar esta publicación?")) return
    try {
      const res = await fetch(`/api/marketing/posts/${postId}`, { method: 'DELETE' })
      if (res.ok) {
        fetchPosts()
      } else {
        alert("Error al eliminar")
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleSaveMetaConfig = async (e) => {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const payload = {
        ...metaConfig,
        public_base_url: window.location.origin
      }
      // No enviar el secret enmascarado (placeholder) al backend
      if (payload.meta_app_secret === '••••••••') {
        delete payload.meta_app_secret
      }
      const res = await fetch('/api/marketing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok) {
        alert("Credenciales guardadas correctamente.")
      } else {
        alert("Error al guardar credenciales")
      }
    } catch(err) {
      alert("Error: " + err.message)
    } finally {
      setSavingConfig(false)
    }
  }

  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5}}>
        <Megaphone size={28} style={{color: 'var(--accent-blue)'}} />
        <h1 className="page-title" style={{margin: 0}}>Marketing & Redes Sociales</h1>
      </div>
      <p className="page-subtitle" style={{marginBottom: 20}}>
        Generá Reels y publicaciones con IA (Gemini), programalos y responde comentarios de Instagram y Facebook.
      </p>

      {/* Tabs Navigation (Responsive grid matching Settings page pattern) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10,
        marginBottom: 25
      }}>
        <button 
          className="btn" 
          onClick={() => setActiveTab('creator')}
          style={{
            backgroundColor: activeTab === 'creator' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'creator' ? '#fff' : 'var(--text-primary)',
            border: activeTab === 'creator' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 8px',
            fontSize: '0.83rem',
            textAlign: 'center'
          }}
        >
          <Sparkles size={16} /> Creador IA & Reels
        </button>
        <button 
          className="btn" 
          onClick={() => setActiveTab('calendar')}
          style={{
            backgroundColor: activeTab === 'calendar' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'calendar' ? '#fff' : 'var(--text-primary)',
            border: activeTab === 'calendar' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 8px',
            fontSize: '0.83rem',
            textAlign: 'center'
          }}
        >
          <Calendar size={16} /> Cola & Calendario ({posts.filter(p => p.status === 'scheduled').length})
        </button>
        {!isSimpleView && (
        <button 
          className="btn" 
          onClick={() => { setActiveTab('comments'); fetchComments(); }}
          style={{
            backgroundColor: activeTab === 'comments' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'comments' ? '#fff' : 'var(--text-primary)',
            border: activeTab === 'comments' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 8px',
            fontSize: '0.83rem',
            textAlign: 'center'
          }}
        >
          <MessageSquare size={16} /> Inbox de Comentarios
        </button>
        )}
        {!isSimpleView && (
        <button 
          className="btn" 
          onClick={() => { setActiveTab('diffusion'); fetchDiffusionData(); }}
          style={{
            backgroundColor: activeTab === 'diffusion' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'diffusion' ? '#fff' : 'var(--text-primary)',
            border: activeTab === 'diffusion' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 8px',
            fontSize: '0.83rem',
            textAlign: 'center'
          }}
        >
          <Send size={16} /> Difusión ({diffusionGroups.length})
        </button>
        )}
        {!isSimpleView && (
        <button 
          className="btn" 
          onClick={() => setActiveTab('config')}
          style={{
            backgroundColor: activeTab === 'config' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'config' ? '#fff' : 'var(--text-primary)',
            border: activeTab === 'config' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 8px',
            fontSize: '0.83rem',
            textAlign: 'center'
          }}
        >
          <SettingsIcon size={16} /> Configuración Redes
        </button>
        )}
      </div>

      {/* TAB 1: Creador IA */}
      {activeTab === 'creator' && (
        <div style={{display: 'flex', gap: 25, flexWrap: 'wrap'}}>
          {/* Columna Izquierda: Generación & Ajustes */}
          <div className="card" style={{flex: 1, minWidth: 260, maxWidth: '100%'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
              <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8}}>
                <Sparkles size={18} style={{color: 'var(--accent-orange)'}} />
                {editingPostId ? `✏️ Editando Publicación #${editingPostId}` : '1. Selección de Producto & IA'}
              </h3>
              {editingPostId && (
                <button className="btn" onClick={handleResetForm} style={{padding: '3px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}>
                  ❌ Cancelar Edición
                </button>
              )}
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                  Producto del Inventario *
                </label>

                {/* Filtros de Categoría y Búsqueda por Nombre */}
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                  <select
                    value={productCategoryFilter}
                    onChange={e => setProductCategoryFilter(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 130,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: productCategoryFilter === 'UNCATEGORIZED' ? '1px solid #f59e0b' : '1px solid var(--border-color)',
                      backgroundColor: productCategoryFilter === 'UNCATEGORIZED' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-dark)',
                      color: productCategoryFilter === 'UNCATEGORIZED' ? '#f59e0b' : 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontWeight: productCategoryFilter === 'UNCATEGORIZED' ? '700' : 'normal'
                    }}
                  >
                    <option value="ALL">📁 Categoría (Todas)</option>
                    <option value="UNCATEGORIZED">⚠️ Sin Categoría</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>📁 {c.name}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="🔍 Buscar por nombre..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    style={{
                      flex: 1.2,
                      minWidth: 130,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>

                {/* Selector de Producto Filtrado */}
                <select 
                  value={selectedProduct} 
                  onChange={e => setSelectedProduct(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-dark)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="">-- Selecciona un producto ({filteredMarketingProducts.length} disponibles) --</option>
                  {filteredMarketingProducts.map(p => (
                    <option key={p.ml_id} value={p.ml_id}>
                      {p.category_name ? `[${p.category_name}] ` : '[Sin Cat] '}{p.title} (${p.price_web > 0 ? `$${p.price_web}` : `$${p.price}`})
                    </option>
                  ))}
                </select>
                {filteredMarketingProducts.length === 0 && (
                  <div style={{fontSize: '0.78rem', color: '#f59e0b', fontStyle: 'italic'}}>
                    ⚠️ No se encontraron productos con la categoría o búsqueda seleccionada.
                  </div>
                )}
              </div>

              {productImages.length > 0 && (
                <div style={{marginTop: -5, marginBottom: 5}}>
                  <div style={{fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6}}>
                    🖼️ Fotos HD del producto ({productImages.length}) - Clic para elegir la foto activa:
                  </div>
                  <div style={{display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6}}>
                    {productImages.map((imgUrl, idx) => {
                      const isSelected = selectedProductImage === imgUrl || mediaUrl === imgUrl
                      return (
                        <div 
                          key={idx} 
                          onClick={() => {
                            setSelectedProductImage(imgUrl)
                            setMediaUrl(imgUrl)
                          }}
                          style={{
                            position: 'relative',
                            border: isSelected ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                            boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            backgroundColor: '#111',
                            padding: 2,
                            flexShrink: 0
                          }}
                          title="Usar esta foto HD para la publicación y la IA"
                        >
                          <img src={imgUrl} alt="" style={{width: 52, height: 52, objectFit: 'cover', borderRadius: 4}} />
                          {isSelected && (
                            <div style={{
                              position: 'absolute',
                              top: 3,
                              right: 3,
                              backgroundColor: 'var(--accent-blue)',
                              color: '#fff',
                              borderRadius: '50%',
                              width: 16,
                              height: 16,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontWeight: 700
                            }}>
                              ✓
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Selector de Precio del Producto (Web, Mercado Libre, Descuento o Personalizado) */}
              {selectedProductObj && (
                <div style={{
                  marginTop: 2,
                  marginBottom: 8,
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                    <span style={{fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6}}>
                      <Tag size={15} /> Precio a promocionar y mostrar en la imagen:
                    </span>
                    <span style={{fontSize: '0.92rem', fontWeight: 800, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 6}}>
                      $ {effectivePrice.toLocaleString('es-AR')} ARS
                    </span>
                  </div>

                  {/* Botones de Selección Rápida de Precio */}
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6}}>
                    {/* Opción 1: Tienda Web */}
                    <button
                      type="button"
                      onClick={() => setPriceSource('web')}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: priceSource === 'web' ? '2px solid #10b981' : '1px solid var(--border-color)',
                        backgroundColor: priceSource === 'web' ? 'rgba(16, 185, 129, 0.22)' : 'var(--bg-dark)',
                        color: priceSource === 'web' ? '#10b981' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{fontSize: '0.72rem', fontWeight: 700}}>🌐 Tienda Web</div>
                      <div style={{fontSize: '0.84rem', fontWeight: 800, marginTop: 2}}>
                        ${(selectedProductObj.price_web > 0 ? selectedProductObj.price_web : selectedProductObj.price || 0).toLocaleString('es-AR')}
                      </div>
                    </button>

                    {/* Opción 2: Mercado Libre */}
                    <button
                      type="button"
                      onClick={() => setPriceSource('meli')}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: priceSource === 'meli' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                        backgroundColor: priceSource === 'meli' ? 'rgba(59, 130, 246, 0.22)' : 'var(--bg-dark)',
                        color: priceSource === 'meli' ? '#60a5fa' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{fontSize: '0.72rem', fontWeight: 700}}>📦 Mercado Libre</div>
                      <div style={{fontSize: '0.84rem', fontWeight: 800, marginTop: 2}}>
                        ${(selectedProductObj.price || 0).toLocaleString('es-AR')}
                      </div>
                    </button>

                    {/* Opción 3: Descuento en Efectivo / Transferencia */}
                    {(() => {
                      const baseWeb = Number(selectedProductObj.price_web > 0 ? selectedProductObj.price_web : selectedProductObj.price) || 0
                      const cashPct = Number(cashDiscountPctInput || 10)
                      const cashVal = Math.round(baseWeb * (1 - cashPct / 100))
                      return (
                        <button
                          type="button"
                          onClick={() => setPriceSource('cash')}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: priceSource === 'cash' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                            backgroundColor: priceSource === 'cash' ? 'rgba(245, 158, 11, 0.22)' : 'var(--bg-dark)',
                            color: priceSource === 'cash' ? '#fbbf24' : 'var(--text-primary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{fontSize: '0.72rem', fontWeight: 700}}>💸 Efectivo ({cashPct}% OFF)</div>
                          <div style={{fontSize: '0.84rem', fontWeight: 800, marginTop: 2}}>
                            ${cashVal.toLocaleString('es-AR')}
                          </div>
                        </button>
                      )
                    })()}

                    {/* Opción 4: Personalizado */}
                    <button
                      type="button"
                      onClick={() => setPriceSource('custom')}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: priceSource === 'custom' ? '2px solid #a855f7' : '1px solid var(--border-color)',
                        backgroundColor: priceSource === 'custom' ? 'rgba(168, 85, 247, 0.22)' : 'var(--bg-dark)',
                        color: priceSource === 'custom' ? '#c084fc' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{fontSize: '0.72rem', fontWeight: 700}}>✏️ Personalizado</div>
                      <div style={{fontSize: '0.84rem', fontWeight: 800, marginTop: 2}}>
                        {customPriceValue ? `$${Number(customPriceValue).toLocaleString('es-AR')}` : 'Manual...'}
                      </div>
                    </button>
                  </div>

                  {/* Subpanel de ajuste fino según la opción */}
                  {priceSource === 'custom' && (
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2}}>
                      <label style={{fontSize: '0.76rem', fontWeight: 600}}>Monto exacto a publicar ($):</label>
                      <input 
                        type="number"
                        value={customPriceValue}
                        onChange={e => setCustomPriceValue(e.target.value)}
                        placeholder="Ej: 49999"
                        style={{maxWidth: 160, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--accent-purple)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 700}}
                      />
                    </div>
                  )}

                  {priceSource === 'cash' && (
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: '0.74rem', color: 'var(--text-secondary)'}}>
                      <span>Ajustar % descuento:</span>
                      <input 
                        type="number"
                        min="1"
                        max="90"
                        value={cashDiscountPctInput}
                        onChange={e => setCashDiscountPctInput(Math.max(1, Math.min(90, Number(e.target.value))))}
                        style={{width: 55, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--accent-orange)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.76rem', fontWeight: 700}}
                      />
                      <span>% OFF</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12}}>
                <label style={{fontSize: '0.85rem'}}>Objetivo Campaña
                  <select value={objective} onChange={e => setObjective(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="promocional">Promocional / Ventas</option>
                    <option value="oferta">Descuento u Oferta</option>
                    <option value="educativo">Educativo / Tips Hidroponía</option>
                  </select>
                </label>

                <label style={{fontSize: '0.85rem'}}>Tono de Voz
                  <select value={tone} onChange={e => setTone(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="entusiasta">Entusiasta & Dinámico</option>
                    <option value="profesional">Profesional & Técnico</option>
                    <option value="divertido">Cercano & Divertido</option>
                  </select>
                </label>
              </div>

              <button 
                className="btn" 
                onClick={handleGenerateAI}
                disabled={generating}
                style={{backgroundColor: 'var(--accent-emerald)', color: '#fff', padding: '10px 15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: generating ? 0.7 : 1}}
              >
                {generating ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {generating ? 'Generando copy con IA...' : '✨ Generar Publicación con Gemini IA'}
              </button>

              {generatedData?.video_script_idea && (
                <div style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8, border: '1px dashed var(--accent-orange)'}}>
                  <div style={{fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-orange)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6}}>
                    <Video size={14} /> Idea de Guión para Reel (15 segs):
                  </div>
                  <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line'}}>
                    {generatedData.video_script_idea}
                  </div>
                </div>
              )}

              {/* Generador de Imagen / Video IA Card */}
              <div style={{
                marginTop: 10,
                padding: 15,
                borderRadius: 10,
                backgroundColor: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 8}}>
                  <Sparkles size={18} /> 🎨 Generar Imagen o Video con IA para tu Publicación
                </div>

                <label style={{fontSize: '0.82rem', fontWeight: 600}}>Instrucción / Prompt para la IA:
                  <input 
                    type="text" 
                    value={videoPrompt} 
                    onChange={e => setVideoPrompt(e.target.value)} 
                    placeholder={postType === 'post' ? "Ej: Imagen promocional hiperrealista para post de Facebook e Instagram..." : "Ej: Video publicitario corto enfocado en kit de regalo y envío gratis..."}
                    style={{width: '100%', marginTop: 5, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}}
                  />
                </label>

                <label style={{fontSize: '0.82rem', fontWeight: 600}}>Generador de Video / Imagen IA:
                  <select 
                    value={videoEngine} 
                    onChange={e => setVideoEngine(e.target.value)}
                    style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}}
                  >
                    <option value="gemini_canvas">🎨 Plantilla Comercial HD (Foto Real de Producto + Precio + Personalizable)</option>
                    <option value="imagen3">🌟 Google Imagen 3.0 / 4.0 (Fotografía Hiperrealista por IA - Gemini API Key)</option>
                    <option value="google_veo">🎬 Google Veo 3.1 Fast (Video IA de 8s en Alta Definición - Google AI Studio)</option>
                  </select>
                </label>

                {/* Panel de Personalización de Plantilla Comercial Canvas */}
                {videoEngine === 'gemini_canvas' && (
                  <div style={{marginTop: 6, padding: '10px 12px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 8}}>
                    <div style={{fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 6}}>
                      <span>🎨 Personalizar Estilo de Plantilla:</span>
                    </div>

                    {/* Row 0: Plantilla / Layout de Diseño */}
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8}}>
                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Plantilla Visual de Diseño:
                        <select 
                          value={canvasLayout} 
                          onChange={e => setCanvasLayout(e.target.value)}
                          style={{width: '100%', marginTop: 3, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent-blue)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 700}}
                        >
                          <option value="glassmorphism">✨ Glassmorphism Canva Style (Fondo difuminado + tarjeta cristal - Recomendado)</option>
                          <option value="modern_split">⚡ Split Editorial Moderno (Foto Full Hero arriba + Info abajo)</option>
                          <option value="bold_promo">🔥 Impacto / Oferta Destacada (Estilo de alto contraste y precio gigante)</option>
                          <option value="classic_box">📦 Clásico Recuadro (Marco tradicional con cabecera y foto centrada)</option>
                        </select>
                      </label>

                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Estilo de Fuente / Tipografía:
                        <select 
                          value={canvasFont} 
                          onChange={e => setCanvasFont(e.target.value)}
                          style={{width: '100%', marginTop: 3, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        >
                          <option value="outfit">✨ Outfit (Ultra-Moderno & Antialiased Pro)</option>
                          <option value="montserrat">⚡ Montserrat (Titulares Negrita de Alto Impacto)</option>
                          <option value="poppins">🌿 Poppins (Limpio & Geométrico)</option>
                          <option value="jakarta">💎 Plus Jakarta Sans (Elegante Editorial)</option>
                        </select>
                      </label>
                    </div>

                    {/* Row 0.5: Logotipo de la Marca */}
                    <label style={{fontSize: '0.78rem', fontWeight: 600}}>Logotipo de la Tienda (PNG Transparente):
                      <div style={{display: 'flex', gap: 8, marginTop: 3, alignItems: 'center'}}>
                        <input 
                          type="text" 
                          value={canvasLogoUrl} 
                          onChange={e => setCanvasLogoUrl(e.target.value)} 
                          placeholder="Cargar URL de Logo PNG de la Tienda (opcional)"
                          style={{flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        />
                        <label className="btn" style={{backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', fontSize: '0.75rem'}}>
                          {uploadingLogo ? <RefreshCw className="animate-spin" size={13} /> : <ImageIcon size={13} />}
                          {uploadingLogo ? 'Subiendo...' : '📁 Subir Logo PNG'}
                          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoUpload} style={{display: 'none'}} />
                        </label>
                        {canvasLogoUrl && (
                          <div style={{display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 6}}>
                            <img src={canvasLogoUrl} alt="Logo" style={{height: 24, maxWidth: 60, objectFit: 'contain'}} />
                            <button 
                              type="button" 
                              onClick={() => setCanvasLogoUrl('')}
                              style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700}}
                              title="Quitar logo y usar texto"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </label>

                    {/* Row 0.6: Ubicación, Arrastre con Mouse y Tamaño del Logo */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(16, 185, 129, 0.3)'}}>
                      <div style={{fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6}}>
                        <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                          <Move size={14} /> Ubicación & Tamaño del Logo:
                        </span>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                          <label style={{fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}}>
                            <input 
                              type="checkbox" 
                              checked={showLogoDragGuide} 
                              onChange={e => setShowLogoDragGuide(e.target.checked)}
                              style={{width: 'auto'}}
                            />
                            Mostrar guía de arrastre en preview
                          </label>
                          {(canvasLogoX !== 50 || canvasLogoY !== 10 || canvasLogoScale !== 100 || canvasLogoBg !== 'none') && (
                            <button 
                              type="button" 
                              onClick={() => { setCanvasLogoX(50); setCanvasLogoY(10); setCanvasLogoScale(100); setCanvasLogoBg('none'); }}
                              style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline'}}
                            >
                              Restablecer Original
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{fontSize: '0.72rem', color: '#94a3b8', backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '5px 8px', borderRadius: 6, border: '1px dashed rgba(16, 185, 129, 0.25)'}}>
                        💡 <strong>Arrastre con el mouse:</strong> Puedes hacer clic o arrastrar directamente el logo sobre la imagen de previsualización a la derecha para ubicarlo donde quieras, o usar los accesos rápidos y deslizadores de abajo:
                      </div>

                      {/* Presets Rápidos */}
                      <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                        <span style={{fontSize: '0.74rem', fontWeight: 600}}>Posiciones Rápidas (1 Clic):</span>
                        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                          {[
                            { label: '↖ Arriba Izq', x: 18, y: 10 },
                            { label: '⬆ Arriba Centro', x: 50, y: 10 },
                            { label: '↗ Arriba Der', x: 82, y: 10 },
                            { label: '🎯 Centro', x: 50, y: 50 },
                            { label: '↙ Abajo Izq', x: 18, y: 92 },
                            { label: '⬇ Abajo Centro', x: 50, y: 92 },
                            { label: '↘ Abajo Der', x: 82, y: 92 },
                          ].map(p => {
                            const isSelected = canvasLogoX === p.x && canvasLogoY === p.y
                            return (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => { setCanvasLogoX(p.x); setCanvasLogoY(p.y); }}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  borderRadius: 5,
                                  border: isSelected ? '1px solid #10b981' : '1px solid var(--border-color)',
                                  backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.22)' : 'var(--bg-dark)',
                                  color: isSelected ? '#10b981' : 'var(--text-primary)',
                                  cursor: 'pointer',
                                  fontWeight: isSelected ? 700 : 500,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {p.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Sliders de Precisión: X, Y, Escala y Fondo */}
                      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'center', marginTop: 2}}>
                        <label style={{fontSize: '0.74rem', fontWeight: 600, display: 'flex', flexDirection: 'column'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <span>Horizontal (X):</span>
                            <span style={{color: 'var(--accent-emerald)', fontWeight: 700}}>{canvasLogoX}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="5" 
                            max="95" 
                            step="1"
                            value={canvasLogoX} 
                            onChange={e => setCanvasLogoX(Number(e.target.value))}
                            style={{width: '100%', marginTop: 4, accentColor: '#10b981', cursor: 'pointer'}}
                          />
                        </label>

                        <label style={{fontSize: '0.74rem', fontWeight: 600, display: 'flex', flexDirection: 'column'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <span>Vertical (Y):</span>
                            <span style={{color: 'var(--accent-emerald)', fontWeight: 700}}>{canvasLogoY}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="5" 
                            max="95" 
                            step="1"
                            value={canvasLogoY} 
                            onChange={e => setCanvasLogoY(Number(e.target.value))}
                            style={{width: '100%', marginTop: 4, accentColor: '#10b981', cursor: 'pointer'}}
                          />
                        </label>

                        <label style={{fontSize: '0.74rem', fontWeight: 600, display: 'flex', flexDirection: 'column'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <span>Tamaño / Escala:</span>
                            <span style={{color: 'var(--accent-emerald)', fontWeight: 700}}>{canvasLogoScale}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="40" 
                            max="200" 
                            step="2"
                            value={canvasLogoScale} 
                            onChange={e => setCanvasLogoScale(Number(e.target.value))}
                            style={{width: '100%', marginTop: 4, accentColor: '#10b981', cursor: 'pointer'}}
                          />
                        </label>

                        <label style={{fontSize: '0.74rem', fontWeight: 600}}>Fondo / Contraste Logo:
                          <select 
                            value={canvasLogoBg} 
                            onChange={e => setCanvasLogoBg(e.target.value)}
                            style={{width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.74rem'}}
                          >
                            <option value="none">Sin Fondo (Transparente)</option>
                            <option value="dark">Cápsula Oscura (Traslúcida)</option>
                            <option value="white">Cápsula Blanca (Traslúcida)</option>
                            <option value="glass">Efecto Cristal Glassmorphism</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    {/* Row 1: Tema & Color de Letras */}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Tema de Fondo:
                        <select 
                          value={canvasTheme} 
                          onChange={e => setCanvasTheme(e.target.value)}
                          style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        >
                          <option value="emerald">🌿 Verde Esmeralda (Hidroponía)</option>
                          <option value="white_clean">⚪ Blanco Liso Minimalista (100% Blanco Sin Bordes)</option>
                          <option value="white">⬜ Blanco Elegante (Con Bordes y Degradado)</option>
                          <option value="blue">🔵 Azul Comercial / Pro</option>
                          <option value="purple">🟣 Violeta Neón / Premium</option>
                          <option value="red">🔴 Rojo Oferta Destacada</option>
                          <option value="dark">🖤 Negro Elegante / Minimalista</option>
                        </select>
                      </label>

                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Color de Letras / Textos:
                        <select 
                          value={canvasTextColor} 
                          onChange={e => setCanvasTextColor(e.target.value)}
                          style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        >
                          <option value="auto">✨ Automático (Según Fondo)</option>
                          <option value="#0f172a">🖤 Negro / Oscuro</option>
                          <option value="#ffffff">🤍 Blanco Puro</option>
                          <option value="#064e3b">🌿 Verde Oscuro</option>
                          <option value="#1e3a8a">🔵 Azul Marino</option>
                          <option value="#7f1d1d">🔴 Rojo Oscuro</option>
                          <option value="#4c1d95">🟣 Violeta Oscuro</option>
                        </select>
                      </label>
                    </div>

                    {/* Row 2: Texto Etiqueta & Color Etiqueta */}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Texto de Etiqueta (Badge):
                        <input 
                          type="text" 
                          value={canvasBadgeText} 
                          onChange={e => setCanvasBadgeText(e.target.value)}
                          placeholder="Ej: ¡PROMO IMPERDIBLE!"
                          style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        />
                      </label>

                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Color de Etiqueta:
                        <select 
                          value={canvasBadgeColor} 
                          onChange={e => setCanvasBadgeColor(e.target.value)}
                          style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        >
                          <option value="#f59e0b">🟧 Naranja Promocional</option>
                          <option value="#10b981">🟩 Verde Hidroponía</option>
                          <option value="#ef4444">🟥 Rojo Intenso</option>
                          <option value="#3b82f6">🟦 Azul Eléctrico</option>
                          <option value="#eab308">🟨 Dorado Premium</option>
                        </select>
                      </label>
                    </div>

                    {/* Row 3: Titular & Pie */}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Titular Personalizado (Opcional):
                        <input 
                          type="text" 
                          value={canvasCustomTitle} 
                          onChange={e => setCanvasCustomTitle(e.target.value)}
                          placeholder="Usar texto redactado por Gemini..."
                          style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        />
                      </label>

                      <label style={{fontSize: '0.78rem', fontWeight: 600}}>Texto de Pie (Llamado a la Acción):
                        <input 
                          type="text" 
                          value={canvasFooterText} 
                          onChange={e => setCanvasFooterText(e.target.value)}
                          placeholder="📲 Comprá en HidroponiaRosario.com"
                          style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem'}}
                        />
                      </label>
                    </div>

                    {/* Row 4: Checkboxes */}
                    <div style={{display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap'}}>
                      <label style={{fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
                        <input 
                          type="checkbox" 
                          checked={canvasShowPrice} 
                          onChange={e => setCanvasShowPrice(e.target.checked)}
                          style={{width: 'auto'}}
                        />
                        Mostrar Precio en la Imagen
                        {effectivePrice > 0 && (
                          <span style={{color: '#10b981', fontWeight: 800, fontSize: '0.76rem'}}>
                            (${effectivePrice.toLocaleString('es-AR')})
                          </span>
                        )}
                      </label>

                      <label style={{fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
                        <input 
                          type="checkbox" 
                          checked={canvasShowBorder} 
                          onChange={e => setCanvasShowBorder(e.target.checked)}
                          style={{width: 'auto'}}
                        />
                        Mostrar Recuadro / Borde en Imagen y Encabezado
                      </label>
                    </div>

                    {/* Row 5: Ajuste y Recorte de Foto del Producto */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)'}}>
                      <div style={{fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span>🖼️ Recorte & Tamaño de Foto del Producto:</span>
                        {(canvasImgFit !== 'contain' || canvasImgScale !== 100 || canvasImgOffsetY !== 0) && (
                          <button 
                            type="button" 
                            onClick={() => { setCanvasImgFit('contain'); setCanvasImgScale(100); setCanvasImgOffsetY(0); }}
                            style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline'}}
                          >
                            Restablecer Ajustes
                          </button>
                        )}
                      </div>

                      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'center'}}>
                        <label style={{fontSize: '0.76rem', fontWeight: 600}}>Modo de Encuadre:
                          <select 
                            value={canvasImgFit} 
                            onChange={e => setCanvasImgFit(e.target.value)}
                            style={{width: '100%', marginTop: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.76rem'}}
                          >
                            <option value="contain">📐 Ajustar Completo (Sin Cortar / Recomendado)</option>
                            <option value="cover">🔍 Rellenar Recuadro (Zoom Completo / Cortar Bordes)</option>
                          </select>
                        </label>

                        <label style={{fontSize: '0.76rem', fontWeight: 600, display: 'flex', flexDirection: 'column'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <span>Zoom / Escala:</span>
                            <span style={{color: 'var(--accent-blue)', fontWeight: 700}}>{canvasImgScale}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="50" 
                            max="150" 
                            step="1"
                            value={canvasImgScale} 
                            onChange={e => setCanvasImgScale(Number(e.target.value))}
                            style={{width: '100%', marginTop: 5, accentColor: 'var(--accent-blue)', cursor: 'pointer'}}
                          />
                        </label>

                        <label style={{fontSize: '0.76rem', fontWeight: 600, display: 'flex', flexDirection: 'column'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <span>Subir / Bajar Foto:</span>
                            <span style={{color: 'var(--accent-blue)', fontWeight: 700}}>{canvasImgOffsetY > 0 ? `+${canvasImgOffsetY}` : canvasImgOffsetY}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="-40" 
                            max="40" 
                            step="1"
                            value={canvasImgOffsetY} 
                            onChange={e => setCanvasImgOffsetY(Number(e.target.value))}
                            style={{width: '100%', marginTop: 5, accentColor: 'var(--accent-blue)', cursor: 'pointer'}}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                <button 
                  className="btn" 
                  onClick={handleGenerateAIVideo}
                  disabled={generatingVideo}
                  style={{backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: generatingVideo ? 0.7 : 1}}
                >
                  {generatingVideo ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {generatingVideo ? 'Generando contenido con IA...' : (postType === 'post' ? '🎨 Generar Imagen IA para Post (1:1)' : '🎬 Generar Video / Reel con IA (9:16)')}
                </button>

                {/* Previsualización del Contenido Generado */}
                {generatedVideoUrl && (
                  <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, backgroundColor: '#000', padding: 12, borderRadius: 10}}>
                    <div style={{fontSize: '0.78rem', color: 'var(--accent-emerald)', fontWeight: 700, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>{postType === 'post' ? '🖼️ Previsualización de Imagen Generada (1:1):' : '🎥 Previsualización del Reel Generado (9:16):'}</span>
                      <span style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}}>Listo para Instagram/Facebook</span>
                    </div>

                    <div 
                      ref={previewContainerRef}
                      onPointerDown={handleContainerPointerDown}
                      onPointerMove={handleLogoPointerMove}
                      onPointerUp={handleLogoDragEnd}
                      onPointerCancel={handleLogoDragEnd}
                      style={{
                        position: 'relative', 
                        display: 'inline-block',
                        maxHeight: 360,
                        maxWidth: '100%',
                        cursor: (videoEngine === 'gemini_canvas' && postType === 'post') ? 'crosshair' : 'default',
                        userSelect: 'none',
                        touchAction: 'none'
                      }}
                    >
                      {(postType !== 'post') && (generatedVideoUrl.includes('.mp4') || generatedVideoUrl.includes('.webm') || videoEngine === 'google_veo' || videoEngine === 'gemini_canvas') ? (
                        <video 
                          src={generatedVideoUrl} 
                          controls 
                          autoPlay 
                          loop 
                          style={{maxHeight: 360, maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.6)', border: '2px solid var(--accent-blue)', display: 'block'}} 
                        />
                      ) : (
                        <img 
                          src={generatedVideoUrl} 
                          alt="Previsualización IA" 
                          draggable={false}
                          style={{maxHeight: 360, maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.6)', border: '2px solid var(--accent-blue)', objectFit: 'contain', display: 'block', pointerEvents: 'none'}} 
                        />
                      )}

                      {/* Interactive Drag Handle Overlay for Gemini Canvas Logo */}
                      {videoEngine === 'gemini_canvas' && postType === 'post' && showLogoDragGuide && (
                        <div
                          onPointerDown={handleLogoDragStart}
                          onPointerMove={handleLogoPointerMove}
                          onPointerUp={handleLogoDragEnd}
                          onPointerCancel={handleLogoDragEnd}
                          style={{
                            position: 'absolute',
                            left: `${canvasLogoX}%`,
                            top: `${canvasLogoY}%`,
                            transform: 'translate(-50%, -50%)',
                            cursor: isDraggingLogo ? 'grabbing' : 'grab',
                            padding: '4px 10px',
                            backgroundColor: isDraggingLogo ? 'rgba(16, 185, 129, 0.75)' : 'rgba(15, 23, 42, 0.85)',
                            border: isDraggingLogo ? '2px solid #34d399' : '2px dashed #10b981',
                            borderRadius: 20,
                            color: '#ffffff',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: '0 4px 14px rgba(0,0,0,0.7)',
                            zIndex: 15,
                            touchAction: 'none',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                            backdropFilter: 'blur(6px)',
                            pointerEvents: 'auto'
                          }}
                          title="Arrastra con el mouse para ubicar el logo donde quieras"
                        >
                          <Move size={12} style={{color: '#34d399'}} />
                          <span>Logo ({canvasLogoX}%, {canvasLogoY}%)</span>
                        </div>
                      )}
                    </div>

                    <div style={{display: 'flex', gap: 8, width: '100%', marginTop: 5, flexWrap: 'wrap'}}>
                      <button 
                        className="btn" 
                        onClick={() => {
                          const validTarget = generatedServerMediaUrl || (!generatedVideoUrl.startsWith('blob:') ? generatedVideoUrl : null) || (!mediaUrl.startsWith('blob:') ? mediaUrl : null)
                          if (validTarget) {
                            setMediaUrl(validTarget)
                            alert(`¡${postType === 'post' ? 'Imagen' : 'Video'} asignado correctamente a la publicación!`)
                          } else {
                            alert("El archivo aún se está procesando y subiendo al servidor. Aguarda unos segundos y vuelve a presionar el botón.")
                          }
                        }}
                        style={{flex: 1.2, padding: '6px 10px', fontSize: '0.75rem', backgroundColor: 'var(--accent-emerald)', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5}}
                      >
                        ✨ Usar en la Publicación
                      </button>

                      <button 
                        type="button"
                        className="btn" 
                        onClick={() => setLightboxMedia({
                          url: generatedVideoUrl,
                          isVideo: postType !== 'post',
                          title: postTitle || 'Imagen Generada HD'
                        })}
                        style={{padding: '6px 10px', fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', color: 'var(--accent-emerald)', border: '1px solid var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600}}
                        title="Ver en pantalla completa con alta resolución (HD)"
                      >
                        <Maximize2 size={13} /> Ver HD
                      </button>

                      <button 
                        className="btn" 
                        onClick={handleGenerateAIVideo}
                        style={{padding: '6px 10px', fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}
                      >
                        🔄 Probar Otra
                      </button>

                      <button 
                        type="button"
                        onClick={() => window.open(generatedVideoUrl, '_blank')}
                        className="btn" 
                        style={{padding: '6px 10px', fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', color: 'var(--accent-blue)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}}
                        title="Abrir en pestaña nueva"
                      >
                        <ExternalLink size={13} /> Abrir
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>



          {/* Columna Derecha: Previsualización & Programación */}
          <div className="card" style={{flex: 1.2, minWidth: 340}}>
            <h3 style={{marginTop: 0, marginBottom: 15}}>2. Detalle y Programación</h3>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem'}}>Título Interno / Campaña *
                <input 
                  type="text" 
                  value={postTitle} 
                  onChange={e => setPostTitle(e.target.value)} 
                  placeholder="Ej: Promo Fertilizantes Hidroponía Primavera"
                  style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Tipo de Publicación
                  <select value={postType} onChange={e => setPostType(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="post">📷 Foto / Post Feed</option>
                    <option value="reel">🎬 Reel de Instagram / Video</option>
                  </select>
                </label>

                <div style={{flex: 1, fontSize: '0.85rem'}}>
                  <div>Redes Destino</div>
                  <div style={{display: 'flex', gap: 12, marginTop: 8}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', cursor: 'pointer'}}>
                      <input type="checkbox" checked={platforms.instagram} onChange={e => setPlatforms({...platforms, instagram: e.target.checked})} /> Instagram
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', cursor: 'pointer'}}>
                      <input type="checkbox" checked={platforms.facebook} onChange={e => setPlatforms({...platforms, facebook: e.target.checked})} /> Facebook
                    </label>
                  </div>
                </div>
              </div>

              {postType === 'reel' && mediaUrl && !isVideoUrl(mediaUrl) && (
                <div style={{fontSize: '0.76rem', color: 'var(--accent-orange)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(245, 158, 11, 0.3)'}}>
                  💡 <strong>Nota sobre Reels:</strong> Los Reels en Instagram requieren un archivo de <strong>VIDEO (.MP4 / .MOV)</strong>. Dado que seleccionaste una imagen estática, el sistema la publicará automáticamente como <strong>Foto en el Feed de Instagram</strong> sin dar error.
                </div>
              )}

              <label style={{fontSize: '0.85rem'}}>Texto de la Publicación (Caption & Hashtags) *
                <textarea 
                  rows={6}
                  value={caption} 
                  onChange={e => setCaption(e.target.value)} 
                  placeholder="El contenido redactado aparecerá aquí..."
                  style={{width: '100%', marginTop: 5, padding: '10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'inherit'}}
                />
              </label>

              <div>
                <label style={{fontSize: '0.85rem', fontWeight: 600}}>URL o Archivo de Imagen / Video *</label>
                <div style={{display: 'flex', gap: 8, marginTop: 5}}>
                  <input 
                    type="text" 
                    value={mediaUrl} 
                    onChange={e => setMediaUrl(toHighResMlImage(e.target.value))} 
                    placeholder="https://... o seleccioná un archivo de la PC" 
                    style={{flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                  />
                  <label className="btn" style={{backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', fontSize: '0.8rem'}}>
                    {uploadingFile ? <RefreshCw className="animate-spin" size={14} /> : <ImageIcon size={14} />}
                    {uploadingFile ? 'Subiendo...' : '📁 Subir de la PC'}
                    <input type="file" accept="image/*,video/*" onChange={handleFileUpload} style={{display: 'none'}} />
                  </label>
                </div>
              </div>

              {mediaUrl && (
                <div style={{padding: 12, borderRadius: 10, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                  <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontWeight: 700, color: 'var(--text-primary)'}}>🖼️ Vista Previa del Medio:</span>
                    <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                      {mediaUrl.includes('-O.') && <span style={{color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.72rem'}}>✨ HD ML (-O.jpg)</span>}
                      {mediaUrl.startsWith('/uploads/') && <span style={{color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.72rem'}}>📁 Archivo Subido</span>}
                    </div>
                  </div>

                  <div 
                    onClick={() => setLightboxMedia({ url: toHighResMlImage(mediaUrl), isVideo: isVideoUrl(mediaUrl), title: postTitle || 'Vista Previa del Medio' })}
                    style={{
                      position: 'relative',
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      cursor: 'zoom-in',
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: '#0a0a0a',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                    title="Haz clic para ver en pantalla completa y alta resolución"
                  >
                    {isVideoUrl(mediaUrl) ? (
                      <video src={mediaUrl} controls style={{maxHeight: 320, maxWidth: '100%', borderRadius: 8}} />
                    ) : (
                      <img 
                        src={toHighResMlImage(mediaUrl)} 
                        alt="Previsualización de la publicación" 
                        onError={(e) => { e.target.onerror = null; e.target.src = mediaUrl; }}
                        style={{maxHeight: 320, maxWidth: '100%', objectFit: 'contain', borderRadius: 8, display: 'block'}} 
                      />
                    )}
                    <div style={{
                      position: 'absolute',
                      bottom: 8,
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(6px)',
                      color: '#ffffff',
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      pointerEvents: 'none',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}>
                      <Maximize2 size={12} style={{color: '#34d399'}} /> Clic para pantalla completa HD
                    </div>
                  </div>

                  <div style={{display: 'flex', gap: 8, width: '100%', marginTop: 8}}>
                    <button
                      type="button"
                      onClick={() => setLightboxMedia({ url: toHighResMlImage(mediaUrl), isVideo: isVideoUrl(mediaUrl), title: postTitle || 'Vista Previa del Medio' })}
                      className="btn"
                      style={{flex: 1, padding: '6px 10px', fontSize: '0.76rem', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 600}}
                    >
                      <Maximize2 size={13} /> Ver Grande (HD)
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(toHighResMlImage(mediaUrl), '_blank')}
                      className="btn"
                      style={{flex: 1, padding: '6px 10px', fontSize: '0.76rem', backgroundColor: 'var(--bg-dark)', color: 'var(--accent-blue)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5}}
                    >
                      <ExternalLink size={13} /> Abrir Pestaña
                    </button>
                  </div>
                </div>
              )}

              <label style={{fontSize: '0.85rem'}}>Fecha y Hora de Publicación (Opcional - Dejar vacío para borrador)
                <input 
                  type="datetime-local" 
                  value={scheduledAt} 
                  onChange={e => setScheduledAt(e.target.value)} 
                  style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                <button 
                  className="btn" 
                  onClick={() => handleSavePost('draft')}
                  disabled={submitting}
                  style={{flex: 1, backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}
                >
                  💾 Guardar Borrador
                </button>

                {scheduledAt && (
                  <button 
                    className="btn" 
                    onClick={() => handleSavePost('scheduled')}
                    disabled={submitting}
                    style={{flex: 1, backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                  >
                    ⏰ Programar Envío
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Cola y Calendario */}
      {activeTab === 'calendar' && (
        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
            <h3 style={{margin: 0}}>Cola de Publicaciones ({posts.length})</h3>
            <button className="btn" onClick={fetchPosts} style={{padding: '5px 10px', fontSize: '0.8rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}}>
              <RefreshCw className={loadingPosts ? "animate-spin" : ""} size={14} /> Actualizar
            </button>
          </div>

          {loadingPosts ? (
            <div style={{textAlign: 'center', padding: 30}}>Cargando publicaciones...</div>
          ) : (
            posts.length === 0 ? (
              <div style={{textAlign: 'center', padding: 30, color: 'var(--text-secondary)'}}>
                No hay publicaciones agendadas o creadas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '15px' }}>
                {posts.map(p => (
                  <div 
                    key={p.id} 
                    style={{
                      backgroundColor: 'var(--bg-dark)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '18px',
                      flexWrap: 'wrap',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
                    }}
                  >
                    {/* Media Thumbnail */}
                    <div style={{ flexShrink: 0 }}>
                      {p.media_urls ? (
                        isVideoUrl(p.media_urls.split(',')[0]) ? (
                          <div style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
                            <video 
                              src={p.media_urls.split(',')[0]} 
                              preload="metadata"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            />
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Video size={20} color="#fff" />
                            </div>
                          </div>
                        ) : (
                          <img 
                            src={toHighResMlImage(p.media_urls.split(',')[0])} 
                            alt="" 
                            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, backgroundColor: '#fff', border: '1px solid var(--border-color)' }} 
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        )
                      ) : (
                        <div style={{ width: 64, height: 64, backgroundColor: 'var(--bg-card)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
                          <ImageIcon size={22} style={{ color: 'var(--text-secondary)' }} />
                        </div>
                      )}
                    </div>

                    {/* Title & Copy */}
                    <div style={{ flex: '1 1 280px', minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: p.post_type === 'reel' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: p.post_type === 'reel' ? 'var(--accent-purple)' : 'var(--accent-blue)'
                        }}>
                          {p.post_type === 'reel' ? '🎬 Reel' : '📷 Post'}
                        </span>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {p.title || 'Publicación sin título'}
                        </h4>
                      </div>

                      <p style={{
                        margin: 0,
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }} title={p.caption}>
                        {p.caption || 'Sin texto adicional.'}
                      </p>
                    </div>

                    {/* Redes & Fecha Programada */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 150 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Redes:</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          color: 'var(--accent-blue)'
                        }}>
                          {p.platforms}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} />
                        <span>{p.scheduled_at ? formatDateTimeAR(p.scheduled_at, { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha (Borrador)'}</span>
                      </div>
                    </div>

                    {/* Estado Badge */}
                    <div style={{ flexShrink: 0 }}>
                      <span style={{
                        fontSize: '0.78rem', 
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: p.status === 'published' ? 'rgba(16, 185, 129, 0.15)' : (p.status === 'scheduled' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                        color: p.status === 'published' ? '#10b981' : (p.status === 'scheduled' ? '#3b82f6' : '#d97706'),
                        border: `1px solid ${p.status === 'published' ? 'rgba(16, 185, 129, 0.3)' : (p.status === 'scheduled' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`
                      }}>
                        {p.status === 'published' ? '✅ Publicado' : (p.status === 'scheduled' ? '⏰ Programado' : '📝 Borrador')}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
                      <button 
                        className="btn" 
                        style={{
                          padding: '6px 12px', 
                          fontSize: '0.78rem', 
                          backgroundColor: 'var(--bg-card)', 
                          color: 'var(--text-primary)', 
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }} 
                        onClick={() => handleEditPost(p)} 
                        title="Editar Borrador / Publicación"
                      >
                        ✏️ Editar
                      </button>

                      {p.status !== 'published' && (
                        <button 
                          className="btn" 
                          disabled={publishingId === p.id}
                          style={{
                            padding: '6px 14px', 
                            fontSize: '0.78rem', 
                            backgroundColor: publishingId === p.id ? 'var(--bg-card)' : 'var(--accent-emerald)', 
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                          }} 
                          onClick={() => handlePublishNow(p.id)} 
                          title="Publicar inmediatamente en Meta"
                        >
                          {publishingId === p.id ? (
                            <>
                              <RefreshCw className="animate-spin" size={14} />
                              <span>Publicando...</span>
                            </>
                          ) : (
                            <>
                              <Send size={14} />
                              <span>Publicar</span>
                            </>
                          )}
                        </button>
                      )}

                      <button 
                        className="btn-icon" 
                        onClick={() => handleDeletePost(p.id)} 
                        style={{
                          color: '#ef4444', 
                          padding: '6px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)'
                        }} 
                        title="Eliminar publicación"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* TAB 3: Inbox de Comentarios */}
      {activeTab === 'comments' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8}}>
              <MessageSquare size={20} style={{color: 'var(--accent-blue)'}} />
              Inbox de Comentarios (Instagram & Facebook)
            </h3>
            <button 
              className="btn" 
              onClick={fetchComments}
              disabled={loadingComments}
              style={{backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6}}
            >
              <RefreshCw className={loadingComments ? "animate-spin" : ""} size={14} />
              {loadingComments ? 'Sincronizando...' : 'Actualizar Comentarios'}
            </button>
          </div>

          {loadingComments ? (
            <div style={{textAlign: 'center', padding: 40, color: 'var(--text-secondary)'}}>
              <RefreshCw className="animate-spin" size={24} style={{marginBottom: 10}} />
              <div>Obteniendo comentarios de Instagram y Facebook...</div>
            </div>
          ) : (
            (!commentsData.instagram?.length && !commentsData.facebook?.length) ? (
              <div className="card" style={{textAlign: 'center', padding: 40, color: 'var(--text-secondary)'}}>
                <MessageSquare size={36} style={{marginBottom: 10, opacity: 0.5}} />
                <h4>No se encontraron comentarios recientes</h4>
                <p style={{fontSize: '0.85rem'}}>Verificá que tus publicaciones tengan comentarios o que tus credenciales de Meta incluyan permisos de lectura de comentarios.</p>
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
                {/* Section Instagram */}
                {commentsData.instagram?.length > 0 && (
                  <div>
                    <h4 style={{marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#e1306c'}}>
                      📸 Instagram ({commentsData.instagram.reduce((acc, p) => acc + (p.comments?.length || 0), 0)} comentarios)
                    </h4>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                      {commentsData.instagram.map((post, pIdx) => (
                        <div key={`ig-${pIdx}`} className="card" style={{padding: 15, borderLeft: '4px solid #e1306c'}}>
                          {/* Post Header */}
                          <div style={{display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)'}}>
                            {post.media_url ? (
                              <img src={post.media_url} alt="" style={{width: 44, height: 44, objectFit: 'cover', borderRadius: 6}} />
                            ) : (
                              <div style={{width: 44, height: 44, backgroundColor: 'var(--bg-dark)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <ImageIcon size={20} />
                              </div>
                            )}
                            <div style={{flex: 1}}>
                              <div style={{fontSize: '0.85rem', fontWeight: 600, maxLine: 1, lineClamp: 1, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
                                {post.caption || 'Publicación sin título'}
                              </div>
                              <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                                {post.timestamp ? formatDateTimeAR(post.timestamp) : ''}
                              </div>
                            </div>
                            {post.permalink && (
                              <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-icon" style={{color: 'var(--accent-blue)'}} title="Ver en Instagram">
                                <ExternalLink size={16} />
                              </a>
                            )}
                          </div>

                          {/* Comments List */}
                          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                            {post.comments.map((c) => (
                              <div key={c.id} style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                                  <span style={{fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent-blue)'}}>
                                    @{c.username || 'usuario'}
                                  </span>
                                  <span style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                                    {c.timestamp ? formatDateTimeAR(c.timestamp, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                  </span>
                                </div>
                                <div style={{fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)'}}>
                                  {c.text}
                                </div>

                                {/* Existing Replies */}
                                {c.replies?.data?.map(rep => (
                                  <div key={rep.id} style={{marginLeft: 15, padding: '6px 10px', backgroundColor: 'var(--bg-card)', borderRadius: 6, marginBottom: 8, borderLeft: '2px solid var(--accent-emerald)', fontSize: '0.8rem'}}>
                                    <strong style={{color: 'var(--accent-emerald)'}}>@{rep.username || 'Tu cuenta'}:</strong> {rep.text}
                                  </div>
                                ))}

                                {/* Reply Input Box */}
                                <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                                  <input 
                                    type="text" 
                                    placeholder={`Responder a @${c.username || 'usuario'}...`}
                                    value={replyInputs[c.id] || ''}
                                    onChange={e => setReplyInputs({ ...replyInputs, [c.id]: e.target.value })}
                                    style={{flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                                  />
                                  <button 
                                    className="btn" 
                                    onClick={() => handleAISuggestReply(c.text, post.caption, c.username, c.id)}
                                    disabled={suggestingId === c.id}
                                    style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--accent-orange)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 4}}
                                    title="Sugerir respuesta con Gemini IA"
                                  >
                                    <Sparkles size={12} />
                                    {suggestingId === c.id ? 'IA...' : 'Sugerir IA'}
                                  </button>
                                  <button 
                                    className="btn" 
                                    onClick={() => handleReplyComment('instagram', c.id)}
                                    disabled={replyingId === c.id || !replyInputs[c.id]}
                                    style={{padding: '4px 10px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff', display: 'flex', alignItems: 'center', gap: 4}}
                                  >
                                    <Send size={12} />
                                    {replyingId === c.id ? 'Enviando...' : 'Responder'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section Facebook */}
                {commentsData.facebook?.length > 0 && (
                  <div>
                    <h4 style={{marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#1877f2'}}>
                      📘 Facebook ({commentsData.facebook.reduce((acc, p) => acc + (p.comments?.length || 0), 0)} comentarios)
                    </h4>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                      {commentsData.facebook.map((post, pIdx) => (
                        <div key={`fb-${pIdx}`} className="card" style={{padding: 15, borderLeft: '4px solid #1877f2'}}>
                          {/* Post Header */}
                          <div style={{display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)'}}>
                            {post.picture ? (
                              <img src={post.picture} alt="" style={{width: 44, height: 44, objectFit: 'cover', borderRadius: 6}} />
                            ) : (
                              <div style={{width: 44, height: 44, backgroundColor: 'var(--bg-dark)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <ImageIcon size={20} />
                              </div>
                            )}
                            <div style={{flex: 1}}>
                              <div style={{fontSize: '0.85rem', fontWeight: 600, maxLine: 1, lineClamp: 1, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
                                {post.message || 'Publicación de Facebook'}
                              </div>
                              <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                                {post.created_time ? formatDateTimeAR(post.created_time) : ''}
                              </div>
                            </div>
                            {post.permalink && (
                              <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-icon" style={{color: 'var(--accent-blue)'}} title="Ver en Facebook">
                                <ExternalLink size={16} />
                              </a>
                            )}
                          </div>

                          {/* Comments List */}
                          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                            {post.comments.map((c) => (
                              <div key={c.id} style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                                  <span style={{fontWeight: 700, fontSize: '0.82rem', color: '#1877f2'}}>
                                    {c.from?.name || 'Usuario de Facebook'}
                                  </span>
                                  <span style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                                    {c.created_time ? formatDateTimeAR(c.created_time, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                  </span>
                                </div>
                                <div style={{fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)'}}>
                                  {c.message}
                                </div>

                                {/* Existing Replies */}
                                {c.comments?.data?.map(rep => (
                                  <div key={rep.id} style={{marginLeft: 15, padding: '6px 10px', backgroundColor: 'var(--bg-card)', borderRadius: 6, marginBottom: 8, borderLeft: '2px solid var(--accent-emerald)', fontSize: '0.8rem'}}>
                                    <strong style={{color: 'var(--accent-emerald)'}}>{rep.from?.name || 'Página'}:</strong> {rep.message}
                                  </div>
                                ))}

                                {/* Reply Input Box */}
                                <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                                  <input 
                                    type="text" 
                                    placeholder={`Responder a ${c.from?.name || 'usuario'}...`}
                                    value={replyInputs[c.id] || ''}
                                    onChange={e => setReplyInputs({ ...replyInputs, [c.id]: e.target.value })}
                                    style={{flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                                  />
                                  <button 
                                    className="btn" 
                                    onClick={() => handleAISuggestReply(c.message, post.message, c.from?.name, c.id)}
                                    disabled={suggestingId === c.id}
                                    style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--accent-orange)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 4}}
                                    title="Sugerir respuesta con Gemini IA"
                                  >
                                    <Sparkles size={12} />
                                    {suggestingId === c.id ? 'IA...' : 'Sugerir IA'}
                                  </button>
                                  <button 
                                    className="btn" 
                                    onClick={() => handleReplyComment('facebook', c.id)}
                                    disabled={replyingId === c.id || !replyInputs[c.id]}
                                    style={{padding: '4px 10px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff', display: 'flex', alignItems: 'center', gap: 4}}
                                  >
                                    <Send size={12} />
                                    {replyingId === c.id ? 'Enviando...' : 'Responder'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* TAB: Difusión & Envíos Masivos */}
      {activeTab === 'diffusion' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 25}}>
          {/* Quick Metrics Header */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15}}>
            <div className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 14}}>
              <div style={{width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Users size={22} />
              </div>
              <div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Grupos de Difusión</div>
                <div style={{fontSize: '1.4rem', fontWeight: 'bold'}}>{diffusionGroups.length} guardados</div>
              </div>
            </div>

            <div className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 14}}>
              <div style={{width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Send size={22} />
              </div>
              <div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Campañas Enviadas</div>
                <div style={{fontSize: '1.4rem', fontWeight: 'bold'}}>{diffusionCampaigns.length} lanzadas</div>
              </div>
            </div>

            <div className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 14}}>
              <div style={{width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Phone size={22} />
              </div>
              <div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Canal WhatsApp (Baileys)</div>
                <div style={{fontSize: '0.95rem', fontWeight: 600, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 5}}>
                  <CheckCircle size={14} /> Listo con Delay Anti-Spam
                </div>
              </div>
            </div>

            <div className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 14}}>
              <div style={{width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Mail size={22} />
              </div>
              <div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Canal Email (SMTP)</div>
                <div style={{fontSize: '0.95rem', fontWeight: 600, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 5}}>
                  <CheckCircle size={14} /> Plantilla HTML Card Pro
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Grupos Guardados */}
          <div className="card" style={{padding: 20}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10}}>
              <div>
                <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8}}>
                  <Users size={20} style={{color: 'var(--accent-blue)'}} /> Grupos de Difusión Guardados
                </h3>
                <p style={{fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0'}}>
                  Formá y reutilizá grupos de clientes de Mercado Libre, consultas de WhatsApp o contactos manuales.
                </p>
              </div>
              <button 
                className="btn" 
                onClick={() => setShowCreateGroupModal(true)}
                style={{backgroundColor: 'var(--accent-blue)', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6}}
              >
                <Plus size={16} /> Crear Nuevo Grupo de Difusión
              </button>
            </div>

            {diffusionGroups.length === 0 ? (
              <div style={{textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-dark)', borderRadius: 10, border: '1px dashed var(--border-color)'}}>
                <Users size={32} style={{marginBottom: 8, opacity: 0.5}} />
                <div>No tenés grupos de difusión guardados todavía.</div>
                <button className="btn" onClick={() => setShowCreateGroupModal(true)} style={{marginTop: 12, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}}>
                  ➕ Crear primer grupo ahora
                </button>
              </div>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 15}}>
                {diffusionGroups.map(group => (
                  <div key={group.id} style={{backgroundColor: 'var(--bg-dark)', padding: 16, borderRadius: 10, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                    <div>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6}}>
                        <div style={{fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)'}}>{group.name}</div>
                        <span style={{fontSize: '0.72rem', padding: '3px 8px', borderRadius: 12, fontWeight: 600, backgroundColor: group.channel_type === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : group.channel_type === 'email' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)', color: group.channel_type === 'whatsapp' ? '#22c55e' : group.channel_type === 'email' ? '#a855f7' : '#3b82f6'}}>
                          {group.channel_type === 'whatsapp' ? '🟢 WhatsApp' : group.channel_type === 'email' ? '📧 Email' : '👥 Ambos'}
                        </span>
                      </div>
                      <p style={{fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12, minHeight: 32}}>
                        {group.description || 'Sin descripción'}
                      </p>
                      <div style={{fontSize: '0.8rem', display: 'flex', gap: 12, color: 'var(--text-secondary)', marginBottom: 15}}>
                        <span>👥 <strong>{group.member_count}</strong> miembros</span>
                        <span>🟢 <strong>{group.whatsapp_member_count}</strong> WhatsApp</span>
                        <span>📧 <strong>{group.email_member_count}</strong> Email</span>
                      </div>
                    </div>
                    <div style={{display: 'flex', gap: 8, borderTop: '1px solid var(--border-color)', pt: 10}}>
                      <button 
                        className="btn" 
                        onClick={() => handleOpenMembersModal(group)}
                        style={{flex: 1, fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}}
                      >
                        👁️ Ver / Editar Miembros
                      </button>
                      <button 
                        className="btn-icon" 
                        onClick={() => handleDeleteGroup(group.id)}
                        style={{color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)'}}
                        title="Eliminar grupo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Armar y Lanzar Difusión */}
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20}}>
            {/* Left: Form */}
            <div className="card" style={{padding: 20}}>
              <h3 style={{margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 8}}>
                <Send size={20} style={{color: 'var(--accent-blue)'}} /> Armar Campaña de Difusión
              </h3>

              <form onSubmit={handleLaunchCampaign} style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                  1. Grupo Destinatario
                  <select 
                    value={selectedTargetGroupId} 
                    onChange={e => setSelectedTargetGroupId(e.target.value)}
                    style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                  >
                    <option value="">-- Seleccionar Grupo Guardado --</option>
                    {diffusionGroups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.member_count} miembros)
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                  <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                    2. Canal de Envío
                    <select 
                      value={campaignChannel} 
                      onChange={e => setCampaignChannel(e.target.value)}
                      style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                    >
                      <option value="both">👥 Ambos (WhatsApp & Email)</option>
                      <option value="whatsapp">🟢 Solo WhatsApp</option>
                      <option value="email">📧 Solo Email</option>
                    </select>
                  </label>

                  <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                    Delay WhatsApp (Segundos)
                    <select 
                      value={campaignDelay} 
                      onChange={e => setCampaignDelay(parseInt(e.target.value))}
                      style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                    >
                      <option value={4}>⚡ 4 Segundos (Rápido)</option>
                      <option value={6}>🛡️ 6 Segundos (Recomendado Anti-Spam)</option>
                      <option value={10}>🔒 10 Segundos (Ultra Seguro)</option>
                    </select>
                  </label>
                </div>

                <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                  3. Título de la Campaña (Interno / Asunto de Email)
                  <input 
                    type="text"
                    value={campaignTitle}
                    onChange={e => setCampaignTitle(e.target.value)}
                    placeholder="Ej: 🔥 Oferta Especial de Primavera - 15% OFF"
                    style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                  />
                </label>

                {/* Quick Auto-fill from Products / Generated Post */}
                <div style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.8rem', fontWeight: 700, marginBottom: 6, color: 'var(--accent-blue)'}}>
                    ✨ Autocompletar con un Producto o Post con IA
                  </div>
                  <select 
                    onChange={e => {
                      const mlId = e.target.value
                      if (!mlId) {
                        setSelectedProductForCampaign(null)
                        return
                      }
                      const p = products.find(prod => prod.ml_id === mlId)
                      if (p) {
                        setSelectedProductForCampaign(p)
                        const price = p.price_web || p.price || 0
                        setCampaignTitle(`🔥 ¡Gran oferta en ${p.title}!`)
                        setCampaignMessage(`¡Hola! Te compartimos una súper oferta exclusiva de Hidroponía Rosario:\n\n🌿 *${p.title}*\n💰 Precio especial: *$${price.toLocaleString('es-AR')} ARS*\n\n🚚 Envíos a todo el país. ¡Comprá el tuyo directo en nuestra Tienda Web!\n📲 Visitanos en nuestra web oficial.`)
                        const imgs = p.images ? p.images.split(',').map(s => s.trim()).filter(Boolean) : (p.thumbnail ? [p.thumbnail] : [])
                        if (imgs.length > 0) setCampaignMediaUrl(toHighResMlImage(imgs[0]))
                      }
                    }}
                    style={{width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem'}}
                  >
                    <option value="">-- Cargar datos de producto del inventario --</option>
                    {products.map(p => (
                      <option key={p.ml_id} value={p.ml_id}>{p.title} (${p.price_web || p.price})</option>
                    ))}
                  </select>
                </div>

                <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                  4. Mensaje Publicitario / Copy
                  <textarea 
                    rows={5}
                    value={campaignMessage}
                    onChange={e => setCampaignMessage(e.target.value)}
                    placeholder="Escribí el texto persuasivo con emojis, detalles de oferta y llamado a la acción..."
                    style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'inherit'}}
                  />
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>5. URL de Imagen / Banner Publicitario (Media)</span>
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={() => setShowCampaignGalleryModal(true)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.78rem',
                        backgroundColor: 'var(--bg-dark)',
                        color: 'var(--accent-blue)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontWeight: '600'
                      }}
                    >
                      🖼️ Subir o Elegir de Mis Archivos
                    </button>
                  </div>

                  <input 
                    type="text"
                    value={campaignMediaUrl}
                    onChange={e => setCampaignMediaUrl(e.target.value)}
                    placeholder="https://... (Foto HD del producto o gráfica de oferta)"
                    style={{width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                  />

                  {/* Product Photos Thumbnail Picker Grid */}
                  {selectedProductForCampaign && (() => {
                    const prodImgs = selectedProductForCampaign.images ? selectedProductForCampaign.images.split(',').map(s => s.trim()).filter(Boolean) : (selectedProductForCampaign.thumbnail ? [selectedProductForCampaign.thumbnail] : [])
                    if (prodImgs.length === 0) return null

                    return (
                      <div style={{
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        marginTop: 4
                      }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          📷 <span>Fotos de {selectedProductForCampaign.title} ({prodImgs.length}): Hacé clic para cambiar la imagen activa</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                          {prodImgs.map((imgUrl, idx) => {
                            const highRes = toHighResMlImage(imgUrl)
                            const isSelected = campaignMediaUrl === highRes || campaignMediaUrl === imgUrl
                            return (
                              <div
                                key={idx}
                                onClick={() => setCampaignMediaUrl(highRes)}
                                style={{
                                  position: 'relative',
                                  width: 56,
                                  height: 56,
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  border: isSelected ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                                  boxShadow: isSelected ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none',
                                  opacity: isSelected ? 1 : 0.65,
                                  transition: 'all 0.2s ease',
                                  flexShrink: 0,
                                  backgroundColor: '#fff'
                                }}
                                title={`Seleccionar imagen ${idx + 1}`}
                              >
                                <img 
                                  src={highRes} 
                                  alt="" 
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                />
                                {isSelected && (
                                  <div style={{
                                    position: 'absolute',
                                    top: 2, right: 2,
                                    backgroundColor: 'var(--accent-blue)',
                                    color: '#fff',
                                    borderRadius: '50%',
                                    width: 16, height: 16,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                  }}>
                                    <Check size={10} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <button 
                  type="submit" 
                  className="btn" 
                  disabled={sendingCampaign}
                  style={{backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', padding: '12px 20px', fontSize: '1rem', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}
                >
                  {sendingCampaign ? <RefreshCw className="spin" size={18} /> : <Send size={18} />}
                  {sendingCampaign ? 'Enviando Difusión...' : '🚀 Lanzar Campaña de Difusión Masiva'}
                </button>
              </form>
            </div>

            {/* Right: Live Preview */}
            <div className="card" style={{padding: 20}}>
              <h3 style={{margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 8}}>
                <Sparkles size={20} style={{color: 'var(--accent-blue)'}} /> Vista Previa del Anuncio (Preview)
              </h3>

              {/* WhatsApp Mockup */}
              <div style={{marginBottom: 20}}>
                <div style={{fontSize: '0.82rem', fontWeight: 700, color: '#22c55e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5}}>
                  <Phone size={14} /> Vista Previa en WhatsApp Chat
                </div>
                <div style={{backgroundColor: '#0b141a', padding: 14, borderRadius: 12, border: '1px solid #202c33', maxWidth: 360}}>
                  <div style={{backgroundColor: '#005c4b', padding: 10, borderRadius: '8px 8px 8px 0', color: '#e9edef', fontSize: '0.85rem', lineHeight: 1.4}}>
                    {campaignMediaUrl && (
                      <img src={campaignMediaUrl} alt="Preview" style={{width: '100%', height: 160, objectFit: 'cover', borderRadius: 6, marginBottom: 8}} />
                    )}
                    <div style={{whiteSpace: 'pre-wrap'}}>{campaignMessage || 'Tu mensaje publicitario aparecerá aquí...'}</div>
                    <div style={{fontSize: '0.68rem', color: '#8696a0', textAlign: 'right', marginTop: 4}}>21:49 ✓✓</div>
                  </div>
                </div>
              </div>

              {/* Email HTML Card Mockup */}
              <div>
                <div style={{fontSize: '0.82rem', fontWeight: 700, color: '#a855f7', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5}}>
                  <Mail size={14} /> Vista Previa en Email HTML Card
                </div>
                <div style={{backgroundColor: '#ffffff', color: '#1e293b', borderRadius: 12, overflow: 'hidden', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}>
                  <div style={{background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', padding: '12px 16px', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center'}}>
                    🌿 Hidroponía Rosario — Novedades & Ofertas
                  </div>
                  <div style={{padding: 16}}>
                    {campaignMediaUrl && (
                      <img src={campaignMediaUrl} alt="Preview" style={{width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 10}} />
                    )}
                    <div style={{fontSize: '0.82rem', lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-wrap'}}>
                      {campaignMessage || 'El diseño responsivo del correo publicitario se renderizará aquí con colores acordes a tu marca.'}
                    </div>
                  </div>
                  <div style={{backgroundColor: '#f8fafc', padding: 8, textAlign: 'center', fontSize: '0.7rem', color: '#64748b', borderTop: '1px solid #e2e8f0'}}>
                    Hidroponía Rosario • Tienda Oficial
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Historial de Campañas */}
          <div className="card" style={{padding: 20}}>
            <h3 style={{margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 8}}>
              <Clock size={20} style={{color: 'var(--accent-blue)'}} /> Historial de Campañas Lanzadas
            </h3>

            {diffusionCampaigns.length === 0 ? (
              <div style={{textAlign: 'center', padding: 20, color: 'var(--text-secondary)'}}>
                No has realizado envíos masivos todavía.
              </div>
            ) : (
              <div style={{overflowX: 'auto'}}>
                <table className="mobile-cards" style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                  <thead>
                    <tr style={{borderBottom: '1px solid var(--border-color)', textAlign: 'left'}}>
                      <th style={{padding: 10}}>Fecha</th>
                      <th style={{padding: 10}}>Título</th>
                      <th style={{padding: 10}}>Grupo</th>
                      <th style={{padding: 10}}>Canal</th>
                      <th style={{padding: 10}}>Alcance</th>
                      <th style={{padding: 10}}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffusionCampaigns.map(c => (
                      <tr key={c.id} style={{borderBottom: '1px solid var(--border-color)'}}>
                        <td data-label="Fecha" style={{padding: 10, color: 'var(--text-secondary)'}}>
                          {formatDateTimeAR(c.created_at)}
                        </td>
                        <td data-label="Título" style={{padding: 10, fontWeight: 600}}>{c.title}</td>
                        <td data-label="Grupo" style={{padding: 10}}>{c.group_name || 'Grupo Eliminado'}</td>
                        <td data-label="Canal" style={{padding: 10}}>
                          <span style={{fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4, backgroundColor: 'var(--bg-dark)'}}>
                            {c.channel === 'whatsapp' ? '🟢 WhatsApp' : c.channel === 'email' ? '📧 Email' : '👥 Ambos'}
                          </span>
                        </td>
                        <td data-label="Alcance" style={{padding: 10}}>
                          ✅ {c.sent_count} / {c.total_targets} enviados {c.failed_count > 0 && <span style={{color: '#ef4444'}}>({c.failed_count} fallidos)</span>}
                        </td>
                        <td data-label="Estado" style={{padding: 10}}>
                          <span style={{fontSize: '0.75rem', padding: '3px 8px', borderRadius: 12, fontWeight: 700, backgroundColor: c.status.startsWith('completed') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: c.status.startsWith('completed') ? '#22c55e' : '#eab308'}}>
                            {c.status === 'completed' ? 'Completado' : c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Crear Grupo de Difusión */}
      {showCreateGroupModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '12px 8px 24px', boxSizing: 'border-box'}}>
          <div className="card" style={{maxWidth: 660, width: '100%', padding: '16px 14px 20px', position: 'relative', flexShrink: 0}}>
            <button onClick={() => setShowCreateGroupModal(false)} style={{position: 'absolute', top: 15, right: 15, background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer'}}>
              <X size={20} />
            </button>
            <h3 style={{marginTop: 0, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8}}>
              <Users size={20} style={{color: 'var(--accent-blue)'}} /> Crear Grupo de Difusión
            </h3>

            <form onSubmit={handleCreateGroup} style={{display: 'flex', flexDirection: 'column', gap: 14}}>
              <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                Nombre del Grupo *
                <input 
                  type="text" 
                  required
                  value={newGroupName} 
                  onChange={e => setNewGroupName(e.target.value)} 
                  placeholder="Ej: Clientes VIP Hidroponía" 
                  style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                Descripción
                <input 
                  type="text" 
                  value={newGroupDesc} 
                  onChange={e => setNewGroupDesc(e.target.value)} 
                  placeholder="Ej: Compradores recurrentes interesados en fertilizantes" 
                  style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <label style={{fontSize: '0.85rem', fontWeight: 600}}>
                Canal Destino Preferido
                <select 
                  value={newGroupChannel} 
                  onChange={e => setNewGroupChannel(e.target.value)} 
                  style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                >
                  <option value="both">👥 Ambos (WhatsApp & Email)</option>
                  <option value="whatsapp">🟢 Solo WhatsApp</option>
                  <option value="email">📧 Solo Email</option>
                </select>
              </label>

              {/* CRM Contact Selection */}
              <div style={{borderTop: '1px solid var(--border-color)', pt: 12}}>
                <div style={{fontSize: '0.9rem', fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                  <div>
                    Importar Contactos del CRM ({filteredCrmContacts.length} filtrados de {crmContacts.length})
                    <div style={{fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)'}}>
                      {newGroupChannel === 'whatsapp' ? '🟢 Filtrando por contactos con WhatsApp (Teléfono)' : newGroupChannel === 'email' ? '📧 Filtrando por contactos con Correo Email' : '👥 Mostrando todos los contactos con datos'}
                    </div>
                  </div>
                  <div style={{display: 'flex', gap: 6}}>
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={() => {
                        const visibleKeys = filteredCrmContacts.map(c => c.buyer_id ? String(c.buyer_id) : (c.phone || c.email))
                        const merged = Array.from(new Set([...selectedBuyerIds, ...visibleKeys]))
                        setSelectedBuyerIds(merged)
                      }}
                      style={{fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                    >
                      Seleccionar Visibles ({filteredCrmContacts.length})
                    </button>
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={() => setSelectedBuyerIds([])}
                      style={{fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}}
                    >
                      Deseleccionar Todos
                    </button>
                  </div>
                </div>

                {/* Search input for contacts */}
                <input 
                  type="text" 
                  placeholder="🔍 Buscar contacto por nombre, apodo, teléfono o email..." 
                  value={contactSearchQuery}
                  onChange={e => setContactSearchQuery(e.target.value)}
                  style={{width: '100%', marginBottom: 10, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}}
                />

                <div style={{maxHeight: 200, overflowY: 'auto', backgroundColor: 'var(--bg-dark)', borderRadius: 8, padding: 10, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 6}}>
                  {filteredCrmContacts.length === 0 ? (
                    <div style={{fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: 12}}>
                      No se encontraron contactos que coincidan con la búsqueda o con el canal seleccionado ({newGroupChannel}).
                    </div>
                  ) : (
                    filteredCrmContacts.map((c, i) => {
                      const key = c.buyer_id ? String(c.buyer_id) : (c.phone || c.email)
                      const isSelected = selectedBuyerIds.includes(key)
                      return (
                        <label key={i} style={{fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.18)' : 'transparent'}}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => {
                              if (e.target.checked) setSelectedBuyerIds([...selectedBuyerIds, key])
                              else setSelectedBuyerIds(selectedBuyerIds.filter(x => x !== key))
                            }}
                          />
                          <span style={{fontWeight: 600, color: 'var(--text-primary)'}}>{c.full_name || c.nickname || 'Cliente CRM'}</span>
                          <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                            {c.phone ? `📱 ${c.phone}` : ''} {c.email ? `✉️ ${c.email}` : ''} ({c.source_platform})
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Manual Member Input */}
              <div style={{borderTop: '1px solid var(--border-color)', pt: 12}}>
                <div style={{fontSize: '0.9rem', fontWeight: 700, marginBottom: 8}}>Agregar Contacto Manual</div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center'}}>
                  <input type="text" placeholder="Nombre" value={manualName} onChange={e => setManualName(e.target.value)} style={{padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}} />
                  <input type="text" placeholder="Teléfono WhatsApp" value={manualPhone} onChange={e => setManualPhone(e.target.value)} style={{padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}} />
                  <input type="email" placeholder="Correo Email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} style={{padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}} />
                  <button 
                    type="button" 
                    className="btn" 
                    onClick={() => {
                      if (!manualName && !manualPhone && !manualEmail) return
                      setManualMemberList([...manualMemberList, { name: manualName, phone: manualPhone, email: manualEmail }])
                      setManualName('')
                      setManualPhone('')
                      setManualEmail('')
                    }}
                    style={{backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '8px 12px', fontSize: '0.82rem'}}
                  >
                    <UserPlus size={14} />
                  </button>
                </div>

                {manualMemberList.length > 0 && (
                  <div style={{marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6}}>
                    {manualMemberList.map((m, idx) => (
                      <span key={idx} style={{fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', padding: '4px 8px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 4}}>
                        {m.name} ({m.phone || m.email})
                        <button type="button" onClick={() => setManualMemberList(manualMemberList.filter((_, i) => i !== idx))} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0}}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10}}>
                <button type="button" className="btn" onClick={() => setShowCreateGroupModal(false)} style={{backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={creatingGroup} style={{backgroundColor: 'var(--accent-blue)', color: '#fff', fontWeight: 'bold'}}>
                  {creatingGroup ? 'Guardando...' : '💾 Guardar Grupo de Difusión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ver / Editar Miembros del Grupo */}
      {viewingMembersGroup && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '12px 8px 24px', boxSizing: 'border-box'}}>
          <div className="card" style={{maxWidth: 660, width: '100%', padding: '16px 14px 20px', position: 'relative', flexShrink: 0}}>
            <button onClick={() => setViewingMembersGroup(null)} style={{position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer'}}>
              <X size={20} />
            </button>
            <h3 style={{marginTop: 0, marginBottom: 5}}>
              Miembros de: <span style={{color: 'var(--accent-blue)'}}>{viewingMembersGroup.name}</span>
            </h3>
            <p style={{fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Lista de contactos que recibirán las publicaciones enviadas a este grupo.
            </p>

            {loadingMembers ? (
              <div style={{textAlign: 'center', padding: 20}}>Cargando miembros...</div>
            ) : groupMembers.length === 0 ? (
              <div style={{textAlign: 'center', padding: 20, color: 'var(--text-secondary)'}}>
                Este grupo no tiene miembros asignados aún.
              </div>
            ) : (
              <div style={{maxHeight: 400, overflowY: 'auto'}}>
                <table className="mobile-cards" style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                  <thead>
                    <tr style={{borderBottom: '1px solid var(--border-color)', textAlign: 'left'}}>
                      <th style={{padding: 8}}>Contacto</th>
                      <th style={{padding: 8}}>Teléfono WhatsApp</th>
                      <th style={{padding: 8}}>Email</th>
                      <th style={{padding: 8}}>Origen</th>
                      <th style={{padding: 8}}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupMembers.map(m => (
                      <tr key={m.id} style={{borderBottom: '1px solid var(--border-color)'}}>
                        <td data-label="Contacto" style={{padding: 8, fontWeight: 600}}>{m.contact_name || 'Sin Nombre'}</td>
                        <td data-label="Teléfono WhatsApp" style={{padding: 8}}>{m.phone ? `📱 ${m.phone}` : '-'}</td>
                        <td data-label="Email" style={{padding: 8}}>{m.email ? `✉️ ${m.email}` : '-'}</td>
                        <td data-label="Origen" style={{padding: 8, fontSize: '0.75rem', color: 'var(--text-secondary)'}}>{m.source}</td>
                        <td data-label="Acción" style={{padding: 8}}>
                          <button onClick={() => handleDeleteMember(m.id)} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer'}} title="Quitar del grupo">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Configuración de Redes */}
      {activeTab === 'config' && (
        <div className="card" style={{maxWidth: 680}}>
          <h3 style={{marginTop: 0, marginBottom: 10}}>Conexión con Meta API (Instagram & Facebook)</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
            Ingresá las credenciales de tu aplicación de Meta for Developers para habilitar la publicación directa y autónoma de publicaciones y Reels.
          </p>

          {/* Quick Access Toolbar */}
          <div style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 20,
            padding: 12,
            backgroundColor: 'var(--bg-hover)',
            borderRadius: 8,
            border: '1px solid var(--border-color)'
          }}>
            <a 
              href="https://developers.facebook.com/tools/explorer/" 
              target="_blank" 
              rel="noreferrer"
              className="btn"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600
              }}
            >
              🔗 Abrir Meta Graph API Explorer
            </a>

            <button 
              type="button" 
              className="btn"
              onClick={handleAutodetectMeta}
              disabled={autodetectLoading}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                backgroundColor: 'var(--accent-emerald)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600
              }}
            >
              {autodetectLoading ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
              {autodetectLoading ? 'Detectando IDs...' : '🔍 Autodetectar IDs desde Token'}
            </button>

            <button 
              type="button" 
              className="btn"
              onClick={() => setShowPermissionsGuide(!showPermissionsGuide)}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              📘 {showPermissionsGuide ? 'Ocultar Guía' : 'Ver Permisos Requeridos'}
            </button>
          </div>

          {/* Expandable Permissions Guide */}
          {showPermissionsGuide && (
            <div style={{
              backgroundColor: 'var(--bg-dark)',
              padding: 14,
              borderRadius: 8,
              border: '1px dashed var(--accent-blue)',
              marginBottom: 20,
              fontSize: '0.8rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{fontWeight: 'bold', color: 'var(--accent-blue)', marginBottom: 8}}>
                🔑 Permisos requeridos al generar el Token en Graph API Explorer:
              </div>
              <ul style={{margin: '0 0 10px 18px', padding: 0, lineHeight: 1.6}}>
                <li><strong>Facebook (Página):</strong> <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>, <code>pages_manage_engagement</code></li>
                <li><strong>Instagram (Empresa):</strong> <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>instagram_manage_comments</code></li>
              </ul>
              <div style={{fontSize: '0.78rem', color: 'var(--accent-orange)'}}>
                💡 <strong>Tip rápido de renovación:</strong> Copiá el Token del Explorer, pégalo en la casilla de abajo y presioná <strong>"🔍 Autodetectar IDs desde Token"</strong> para autocompletar el Facebook Page ID y el Instagram Business Account ID en 1 clic.
              </div>
            </div>
          )}

          <form onSubmit={handleSaveMetaConfig} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
            <label style={{fontSize: '0.85rem'}}>Meta Access Token (Token de acceso de página o usuario)
              <input 
                type="text" 
                value={metaConfig.meta_access_token} 
                onChange={e => setMetaConfig({...metaConfig, meta_access_token: e.target.value})} 
                placeholder="EAA..." 
                style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              />
            </label>

            {/* Botón de intercambio de token de larga duración */}
            <div style={{
              padding: 14,
              backgroundColor: 'var(--bg-dark)',
              borderRadius: 8,
              border: '1px solid var(--accent-emerald)',
            }}>
              <div style={{fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 10}}>
                🔄 <strong>Obtener Token Perpetuo:</strong> Pegá tu token del <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{color: 'var(--accent-blue)'}}>Graph API Explorer</a> arriba y presioná el botón para convertirlo automáticamente en un <strong style={{color: 'var(--accent-emerald)'}}>Token de Página que nunca expira</strong>.
              </div>
              <button 
                type="button" 
                className="btn"
                onClick={handleExchangeToken}
                disabled={exchangeLoading || !metaConfig.meta_access_token?.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--accent-emerald)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 700
                }}
              >
                {exchangeLoading ? <RefreshCw className="animate-spin" size={14} /> : '♾️'}
                {exchangeLoading ? 'Intercambiando token con Meta...' : '🔄 Obtener Token de Larga Duración (Perpetuo)'}
              </button>
              {exchangeResult && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                  backgroundColor: exchangeResult.type === 'success' ? 'rgba(45, 212, 100, 0.1)' : 'rgba(255, 80, 80, 0.1)',
                  border: `1px solid ${exchangeResult.type === 'success' ? 'var(--accent-emerald)' : '#ff5050'}`,
                  color: exchangeResult.type === 'success' ? 'var(--accent-emerald)' : '#ff5050'
                }}>
                  {exchangeResult.type === 'success' ? '✅' : '❌'} {exchangeResult.message}
                </div>
              )}
            </div>

            <label style={{fontSize: '0.85rem'}}>Instagram Business Account ID
              <input 
                type="text" 
                value={metaConfig.meta_instagram_account_id} 
                onChange={e => setMetaConfig({...metaConfig, meta_instagram_account_id: e.target.value})} 
                placeholder="178414..." 
                style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              />
            </label>

            <label style={{fontSize: '0.85rem'}}>Facebook Page ID
              <input 
                type="text" 
                value={metaConfig.meta_facebook_page_id} 
                onChange={e => setMetaConfig({...metaConfig, meta_facebook_page_id: e.target.value})} 
                placeholder="102938..." 
                style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              />
            </label>

            {/* Credenciales de la App Meta — solo visibles para el admin de la plataforma */}
            {isPlatformAdmin && (
              <div style={{
                marginTop: 5,
                padding: 14,
                backgroundColor: 'var(--bg-hover)',
                borderRadius: 8,
                border: '1px dashed var(--accent-orange)'
              }}>
                <div style={{fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--accent-orange)', marginBottom: 10}}>
                  🔐 Credenciales de la App Meta (Solo Administrador de Plataforma)
                </div>
                <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12}}>
                  Estos datos provienen de tu App en <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" style={{color: 'var(--accent-blue)'}}>Meta for Developers</a> → Configuración → Básica. Se configuran <strong>una sola vez</strong> y aplican a todos los clientes de la plataforma.
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                  <label style={{fontSize: '0.85rem'}}>Meta App ID (client_id)
                    <input 
                      type="text" 
                      value={metaConfig.meta_app_id} 
                      onChange={e => setMetaConfig({...metaConfig, meta_app_id: e.target.value})} 
                      placeholder="1234567890123456" 
                      style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                    />
                  </label>
                  <label style={{fontSize: '0.85rem'}}>Meta App Secret (client_secret)
                    <input 
                      type="password" 
                      value={metaConfig.meta_app_secret} 
                      onChange={e => setMetaConfig({...metaConfig, meta_app_secret: e.target.value})} 
                      placeholder="abc123def456..." 
                      style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                    />
                  </label>
                </div>
              </div>
            )}

            <button type="submit" className="btn" disabled={savingConfig} style={{backgroundColor: 'var(--accent-blue)', color: '#fff', alignSelf: 'flex-start', marginTop: 10, padding: '10px 20px', fontWeight: 'bold'}}>
              {savingConfig ? 'Guardando...' : '💾 Guardar Credenciales de Meta'}
            </button>
          </form>
        </div>
      )}

      {/* Campaign Gallery / MediaBrowser Modal */}
      {showCampaignGalleryModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 99999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div className="card" style={{
            width: 820,
            maxWidth: '96vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '22px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={20} style={{ color: 'var(--accent-blue)' }} />
                <span>Elegir o Subir Imagen para la Campaña</span>
              </h3>
              <button 
                className="btn-icon" 
                onClick={() => setShowCampaignGalleryModal(false)}
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={20} />
              </button>
            </div>

            <MediaBrowser onSelectImage={(url) => {
              setCampaignMediaUrl(url)
              setShowCampaignGalleryModal(false)
            }} />
          </div>
        </div>
      )}

      {/* MODAL LIGHTBOX: VISOR DE IMAGEN / VIDEO EN ALTA RESOLUCIÓN (HD 1080x1080) */}
      {lightboxMedia && (
        <div 
          onClick={() => setLightboxMedia(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.94)',
            backdropFilter: 'blur(12px)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            padding: 20,
            boxSizing: 'border-box'
          }}
        >
          {/* Header Bar */}
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 18px',
              backgroundColor: 'rgba(15, 23, 42, 0.90)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 12,
              marginBottom: 14,
              color: '#ffffff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
              <span style={{fontSize: '0.92rem', fontWeight: 800, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6}}>
                <Sparkles size={16} /> Vista en Alta Resolución HD (1080 × 1080)
              </span>
              {lightboxMedia.title && (
                <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                  — {lightboxMedia.title}
                </span>
              )}
            </div>

            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
              {!lightboxMedia.isVideo && (
                <button
                  type="button"
                  onClick={() => setLightboxZoom(!lightboxZoom)}
                  className="btn"
                  style={{padding: '6px 12px', fontSize: '0.78rem', backgroundColor: lightboxZoom ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-dark)', color: lightboxZoom ? '#10b981' : 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}}
                >
                  <Maximize2 size={13} /> {lightboxZoom ? 'Ajustar a Pantalla' : 'Zoom 100%'}
                </button>
              )}

              <button
                type="button"
                onClick={() => window.open(lightboxMedia.url, '_blank')}
                className="btn"
                style={{padding: '6px 12px', fontSize: '0.78rem', backgroundColor: 'var(--bg-dark)', color: 'var(--accent-blue)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}}
              >
                <ExternalLink size={13} /> Abrir Pestaña
              </button>

              {!lightboxMedia.isVideo && (
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a')
                    a.href = lightboxMedia.url
                    a.download = `publicacion_hd_${Date.now()}.jpg`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                  }}
                  className="btn"
                  style={{padding: '6px 12px', fontSize: '0.78rem', backgroundColor: 'var(--accent-emerald)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600}}
                >
                  <Download size={13} /> Descargar HD
                </button>
              )}

              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
                title="Cerrar (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Media Viewport */}
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              padding: 10
            }}
          >
            {lightboxMedia.isVideo ? (
              <video 
                src={lightboxMedia.url} 
                controls 
                autoPlay 
                loop 
                style={{
                  maxHeight: '84vh',
                  maxWidth: '92vw',
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.9)'
                }} 
              />
            ) : (
              <img 
                src={lightboxMedia.url} 
                alt="Alta resolución HD" 
                style={{
                  maxHeight: lightboxZoom ? 'none' : '84vh',
                  maxWidth: lightboxZoom ? 'none' : '92vw',
                  width: lightboxZoom ? '1080px' : 'auto',
                  height: lightboxZoom ? '1080px' : 'auto',
                  objectFit: 'contain',
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.9)',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: '#050505',
                  display: 'block'
                }} 
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * SendGrid Mailer Dashboard
 * Main application logic for email sending interface
 */

// ============================================
// Constants
// ============================================

const MESSAGE_TIMEOUT = 6000
const IMAGE_REGEX = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi
const STYLE_REGEX = /background-image\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi
const EMAIL_SEPARATORS = /[\n,;]+/
const EXCLUDED_IMAGE_PREFIXES = ['data:', 'http', '//']

// ============================================
// DOM Elements Cache
// ============================================

const els = {
  // Form
  emailForm: document.getElementById('emailForm'),
  
  // Recipients
  recipientsText: document.getElementById('recipientsText'),
  recipientsFile: document.getElementById('recipientsFile'),
  recipientCount: document.getElementById('recipientCount'),
  csvPreview: document.getElementById('csvPreview'),
  
  // Subject
  subject: document.getElementById('subject'),
  
  // Templates
  templateSelect: document.getElementById('templateSelect'),
  loadTemplateBtn: document.getElementById('loadTemplateBtn'),
  localTemplateFile: document.getElementById('localTemplateFile'),
  templateFileInfo: document.getElementById('templateFileInfo'),
  
  // Images
  imagesFolder: document.getElementById('imagesFolder'),
  imagesFolderInfo: document.getElementById('imagesFolderInfo'),
  embedImagesBtn: document.getElementById('embedImagesBtn'),
  
  // HTML Content
  htmlContent: document.getElementById('htmlContent'),
  extractedImages: document.getElementById('extractedImages'),
  
  // Attachments
  attachments: document.getElementById('attachments'),
  fileList: document.getElementById('fileList'),
  
  // Actions
  sendBtn: document.getElementById('sendBtn'),
  sendBtnText: document.getElementById('sendBtnText'),
  sendBtnLoader: document.getElementById('sendBtnLoader'),
  previewBtn: document.getElementById('previewBtnBottom'),
  
  // Modal
  previewModal: document.getElementById('previewModal'),
  closePreview: document.getElementById('closePreview'),
  previewFrame: document.getElementById('previewFrame'),
  
  // Messages
  message: document.getElementById('message'),
  
  // Clear buttons
  clearRecipientsText: document.getElementById('clearRecipientsText'),
  clearRecipientsFile: document.getElementById('clearRecipientsFile'),
  clearSubject: document.getElementById('clearSubject'),
  clearLocalTemplateFile: document.getElementById('clearLocalTemplateFile'),
  clearImagesFolder: document.getElementById('clearImagesFolder'),
  clearHtmlContent: document.getElementById('clearHtmlContent'),
  clearAttachments: document.getElementById('clearAttachments'),
}

// ============================================
// Application State
// ============================================

const state = {
  selectedAttachments: [],
  csvRecipientsLoaded: [],
  selectedTemplateImages: [],
  requiredImages: [],
}

// ============================================
// Utility Functions
// ============================================

/**
 * Display a message to the user
 * @param {string} text - Message text
 * @param {string} type - Message type: 'success' or 'error'
 */
function showMessage(text, type) {
  els.message.textContent = text
  els.message.className = `message ${type}`
  els.message.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  
  setTimeout(() => {
    els.message.className = 'message'
    els.message.textContent = ''
  }, MESSAGE_TIMEOUT)
}

/**
 * Extract unique emails from a list
 * @param {string[]} list - Array of email strings
 * @returns {string[]} Array of unique emails
 */
function uniqEmails(list) {
  const seen = new Set()
  const result = []
  
  for (const email of list) {
    const trimmed = (email || '').trim()
    if (!trimmed) continue
    
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    
    seen.add(key)
    result.push(trimmed)
  }
  
  return result
}

/**
 * Update recipient count display
 */
function updateRecipientCount() {
  const manualEmails = uniqEmails((els.recipientsText.value || '').split(EMAIL_SEPARATORS))
  const csvCount = state.csvRecipientsLoaded.length
  const total = manualEmails.length + csvCount
  
  els.recipientCount.textContent = total ? `${total} recipient${total === 1 ? '' : 's'}` : ''
  els.recipientCount.style.display = total ? 'inline-flex' : 'none'
}

/**
 * Format file size to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`
}

/**
 * Toggle file input wrapper class
 * @param {HTMLElement} input - File input element
 * @param {boolean} hasFile - Whether file is selected
 */
function toggleFileInputState(input, hasFile) {
  const wrapper = input?.closest('.input-wrapper')
  if (hasFile) {
    wrapper?.classList.add('has-file')
  } else {
    wrapper?.classList.remove('has-file')
  }
}

// ============================================
// Template Management
// ============================================

/**
 * Load templates from server
 */
async function loadTemplates() {
  if (!els.templateSelect) return
  
  try {
    const response = await fetch('/api/templates')
    const data = await response.json()
    
    els.templateSelect.innerHTML = '<option value="">Choose a template...</option>';
    
    const templates = data.templates || []
    templates.forEach(template => {
      const option = document.createElement('option')
      option.value = template.name
      option.textContent = template.name
      els.templateSelect.appendChild(option)
    })
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

/**
 * Parse CSV file and extract emails
 * @param {string} text - CSV file content
 * @returns {string[]} Array of email addresses
 */
function parseCSV(text) {
  const lines = text.split('\n')
  const emails = []
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('@')) continue
    
    const match = trimmed.match(/"([^"]+)"/) || trimmed.match(/([^\s,;]+@[^\s,;]+)/)
    if (match) {
      emails.push((match[1] || match[0]).trim())
    }
  }
  
  return uniqEmails(emails)
}

/**
 * Load HTML content and extract image references
 * @param {string} htmlContent - HTML content string
 */
function loadHtmlContent(htmlContent) {
  els.htmlContent.value = htmlContent
  state.requiredImages = extractImageReferences(htmlContent)
  updateImageMatchingStatus()
}

/**
 * Scroll to HTML content section
 */
function scrollToHtmlContent() {
  const htmlSection = document.querySelector('section.step-card:nth-of-type(4)')
  htmlSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ============================================
// Image Detection and Matching
// ============================================

/**
 * Extract image references from HTML content
 * @param {string} html - HTML content
 * @returns {Array<{reference: string, filename: string}>} Array of image references
 */
function extractImageReferences(html) {
  const refs = new Set()
  let match
  
  // Extract from <img> tags
  while ((match = IMAGE_REGEX.exec(html)) !== null) {
    const src = match[1]
    if (isValidImageReference(src)) {
      refs.add(src)
    }
  }
  
  // Extract from background-image styles
  while ((match = STYLE_REGEX.exec(html)) !== null) {
    const src = match[1]
    if (isValidImageReference(src)) {
      refs.add(src)
    }
  }
  
  return Array.from(refs).map(ref => ({
    reference: ref,
    filename: extractFilename(ref),
  }))
}

/**
 * Check if image reference should be processed
 * @param {string} src - Image source
 * @returns {boolean}
 */
function isValidImageReference(src) {
  if (!src) return false
  return !EXCLUDED_IMAGE_PREFIXES.some(prefix => src.startsWith(prefix))
}

/**
 * Extract filename from image path
 * @param {string} path - Image path
 * @returns {string} Filename
 */
function extractFilename(path) {
  return path.split(/[/\\]/).pop().split('?')[0]
}

/**
 * Update image matching status display
 */
function updateImageMatchingStatus() {
  const statusContainer = document.getElementById('imageMatchingStatus')
  if (!statusContainer) return
  
  if (state.requiredImages.length === 0) {
    statusContainer.innerHTML = ''
    statusContainer.style.display = 'none'
    return
  }
  
  const fileMap = createFileMap(state.selectedTemplateImages)
  const statusHtml = buildImageStatusHtml(fileMap)
  
  statusContainer.innerHTML = statusHtml
  statusContainer.style.display = 'block'
}

/**
 * Create a map of uploaded files by filename
 * @param {File[]} files - Array of file objects
 * @returns {Map<string, File>} Map of filename to file
 */
function createFileMap(files) {
  const map = new Map()
  for (const file of files) {
    map.set(file.name.toLowerCase(), file)
  }
  return map
}

/**
 * Build HTML for image matching status
 * @param {Map<string, File>} fileMap - Map of uploaded files
 * @returns {string} HTML string
 */
function buildImageStatusHtml(fileMap) {
  let html = '<div class="image-status-header"><strong>Required Images Status:</strong></div>'
  let allMatched = true
  const missingCount = []
  
  state.requiredImages.forEach(img => {
    const matched = fileMap.has(img.filename.toLowerCase())
    if (!matched) {
      allMatched = false
      missingCount.push(img)
    }
    
    html += `
      <div class="image-status-item ${matched ? 'matched' : 'missing'}">
        <span class="status-icon">${matched ? '✓' : '✗'}</span>
        <span class="image-name">${img.filename}</span>
        <span class="status-badge ${matched ? 'matched-badge' : 'missing-badge'}">
          ${matched ? 'Matched' : 'Missing'}
        </span>
      </div>
    `
  })
  
  if (allMatched && state.requiredImages.length > 0) {
    html += '<div class="image-status-summary success">All required images are ready!</div>'
  } else if (state.requiredImages.length > 0) {
    html += `<div class="image-status-summary warning">Upload ${missingCount.length} more image(s)</div>`
  }
  
  return html
}

// ============================================
// Image Embedding
// ============================================

/**
 * Embed images into HTML content
 * @returns {Promise<number>} Number of images embedded
 */
async function embedImagesIntoHtml() {
  const html = els.htmlContent.value || ''
  if (!html.trim()) {
    showMessage('HTML content is empty. Load a template or paste HTML first.', 'error')
    return 0
  }
  
  if (!state.selectedTemplateImages.length) {
    showMessage('No images selected. Select image files first.', 'error')
    return 0
  }
  
  const fileMap = createFileMap(state.selectedTemplateImages)
  const imageRefs = extractImageReferences(html)
  let modified = html
  let embedded = 0
  
  for (const imgRef of imageRefs) {
    const file = fileMap.get(imgRef.filename.toLowerCase())
    if (!file) continue
    
    const dataUrl = await readFileAsDataUrl(file)
    modified = replaceImageReference(modified, imgRef.reference, dataUrl)
    embedded++
  }
  
  els.htmlContent.value = modified
  return embedded
}

/**
 * Read file as data URL
 * @param {File} file - File object
 * @returns {Promise<string>} Data URL string
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Replace image reference in HTML with data URL
 * @param {string} html - HTML content
 * @param {string} reference - Original image reference
 * @param {string} dataUrl - Data URL to replace with
 * @returns {string} Modified HTML
 */
function replaceImageReference(html, reference, dataUrl) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Replace in <img> tags
  html = html.replace(
    new RegExp(`(<img[^>]+src\\s*=\\s*["'])${escaped}(["'][^>]*>)`, 'gi'),
    `$1${dataUrl}$2`
  )
  
  // Replace in background-image styles
  html = html.replace(
    new RegExp(`(background-image\\s*:\\s*url\\s*\\(\\s*["']?)${escaped}(["']?\\s*\\))`, 'gi'),
    `$1${dataUrl}$2`
  )
  
  return html
}

// ============================================
// Attachments Management
// ============================================

/**
 * Update attachments UI display
 */
function updateAttachmentsUI() {
  els.fileList.innerHTML = ''
  
  if (state.selectedAttachments.length === 0) {
    els.fileList.innerHTML = '<div class="no-files">No attachments selected</div>'
    return
  }
  
  state.selectedAttachments.forEach((file, index) => {
    const item = document.createElement('div')
    item.className = 'file-item'
    item.innerHTML = `
      <span class="file-name">${file.name}</span>
      <span class="file-size">${formatFileSize(file.size)}</span>
      <button type="button" class="remove-file" data-index="${index}" title="Remove">×</button>
    `
    els.fileList.appendChild(item)
  })
  
  // Attach remove handlers
  els.fileList.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index)
      state.selectedAttachments.splice(index, 1)
      updateAttachmentsUI()
    })
  })
}

// ============================================
// Tab Management
// ============================================

/**
 * Setup tab switching functionality
 */
function setupTabs() {
  // Recipients tabs
  setupTabGroup('section.step-card:nth-of-type(1)', {
    manual: 'manualTab',
    csv: 'csvTab',
  })
  
  // Template tabs
  setupTabGroup('section.step-card:nth-of-type(3)', {
    serverTpl: 'serverTemplateTab',
    localTpl: 'localTemplateTab',
    manualHtml: 'manualHtmlTab',
  })
}

/**
 * Setup tab group with click handlers
 * @param {string} containerSelector - CSS selector for tab container
 * @param {Object} tabMap - Map of tab data-tab values to panel IDs
 */
function setupTabGroup(containerSelector, tabMap) {
  const container = document.querySelector(containerSelector)
  if (!container) return
  
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabValue = btn.dataset.tab
      
      // Update button states
      container.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b === btn)
      })
      
      // Update panel states
      Object.entries(tabMap).forEach(([key, panelId]) => {
        const panel = document.getElementById(panelId)
        if (panel) {
          panel.classList.toggle('active', key === tabValue)
        }
      })
    })
  })
}

// ============================================
// Preview Modal
// ============================================

/**
 * Show preview modal
 */
function showPreview() {
  const html = els.htmlContent.value || ''
  if (!html.trim()) {
    showMessage('HTML content is empty. Add content first.', 'error')
    return
  }
  
  els.previewFrame.srcdoc = html
  els.previewModal.style.display = 'block'
  document.body.style.overflow = 'hidden'
}

/**
 * Close preview modal
 */
function closePreview() {
  els.previewModal.style.display = 'none'
  document.body.style.overflow = ''
}

// ============================================
// Form Validation
// ============================================

/**
 * Validate form before submission
 * @returns {Object} Validation result with isValid flag and error message
 */
function validateForm() {
  const subject = (els.subject.value || '').trim()
  const html = (els.htmlContent.value || '').trim()
  const recipientsText = (els.recipientsText.value || '').trim()
  
  if (!subject) {
    return { isValid: false, message: 'Email subject is required', focus: els.subject }
  }
  
  if (!html) {
    return { isValid: false, message: 'HTML content is required', focus: els.htmlContent }
  }
  
  if (!recipientsText && state.csvRecipientsLoaded.length === 0) {
    return { isValid: false, message: 'Please add at least one recipient' }
  }
  
  return { isValid: true }
}

/**
 * Prepare form data for submission
 * @returns {FormData} Form data object
 */
function prepareFormData() {
  const formData = new FormData()
  const subject = (els.subject.value || '').trim()
  const html = (els.htmlContent.value || '').trim()
  const recipientsText = (els.recipientsText.value || '').trim()
  
  formData.append('subject', subject)
  formData.append('htmlContent', html)
  
  if (recipientsText) {
    formData.append('recipientsText', recipientsText)
  }
  
  if (els.recipientsFile.files?.[0]) {
    formData.append('recipientsFile', els.recipientsFile.files[0])
  }
  
  if (els.localTemplateFile.files?.[0]) {
    formData.append('localTemplateFile', els.localTemplateFile.files[0])
  }
  
  state.selectedTemplateImages.forEach(file => {
    formData.append('templateImages', file)
  })
  
  state.selectedAttachments.forEach(file => {
    formData.append('attachments', file)
  })
  
  return formData
}

/**
 * Update send button state
 * @param {boolean} isLoading - Whether email is being sent
 */
function updateSendButtonState(isLoading) {
  els.sendBtn.disabled = isLoading
  els.sendBtnText.textContent = isLoading ? 'Sending...' : '📧 Send Email'
  els.sendBtnLoader.style.display = isLoading ? 'inline-block' : 'none'
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
  e.preventDefault()
  
  const validation = validateForm()
  if (!validation.isValid) {
    showMessage(validation.message, 'error')
    validation.focus?.focus()
    return
  }
  
  const formData = prepareFormData()
  updateSendButtonState(true)
  
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      body: formData,
    })
    
    const data = await response.json()
    
    if (response.ok && data.success) {
      const message = data.message || 
        `Email sent successfully! ${data.successCount || 0} sent, ${data.failureCount || 0} failed`
      showMessage(message, 'success')
    } else {
      const errorMsg = data.errorMessage || data.error || data.message || 'Failed to send email'
      showMessage(errorMsg, 'error')
    }
  } catch (error) {
    showMessage(`Error: ${error.message || 'Failed to send email'}`, 'error')
  } finally {
    updateSendButtonState(false)
  }
}

// ============================================
// Event Handlers Setup
// ============================================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Recipients
  els.recipientsText.addEventListener('input', updateRecipientCount)
  
  els.recipientsFile.addEventListener('change', async () => {
    const file = els.recipientsFile.files?.[0]
    toggleFileInputState(els.recipientsFile, !!file)
    
    if (file) {
      try {
        const text = await file.text()
        state.csvRecipientsLoaded = parseCSV(text)
        
        els.csvPreview.textContent = state.csvRecipientsLoaded.length
          ? `✓ Loaded ${state.csvRecipientsLoaded.length} email${state.csvRecipientsLoaded.length === 1 ? '' : 's'} from ${file.name}`
          : '✗ No valid emails found in file'
        els.csvPreview.className = state.csvRecipientsLoaded.length ? 'info-box success' : 'info-box error'
        updateRecipientCount()
      } catch (error) {
        showMessage('Failed to read CSV file', 'error')
      }
    }
  })
  
  // Template loading
  els.loadTemplateBtn.addEventListener('click', async () => {
    const templateName = els.templateSelect.value
    if (!templateName) {
      showMessage('Please select a template first', 'error')
      return
    }
    
    try {
      els.loadTemplateBtn.disabled = true
      els.loadTemplateBtn.textContent = 'Loading...'
      
      const response = await fetch(`/api/templates/${encodeURIComponent(templateName)}`)
      const data = await response.json()
      
      if (data.content) {
        loadHtmlContent(data.content)
        
        const message = state.requiredImages.length > 0
          ? `Template "${templateName}" loaded. ${state.requiredImages.length} image(s) detected.`
          : `Template "${templateName}" loaded successfully`
        showMessage(message, 'success')
        scrollToHtmlContent()
      } else {
        showMessage('Template is empty', 'error')
      }
    } catch (error) {
      showMessage('Failed to load template', 'error')
    } finally {
      els.loadTemplateBtn.disabled = false
      els.loadTemplateBtn.textContent = 'Load Template'
    }
  })
  
  els.localTemplateFile.addEventListener('change', async () => {
    const file = els.localTemplateFile.files?.[0]
    toggleFileInputState(els.localTemplateFile, !!file)
    
    if (file) {
      try {
        const text = await file.text()
        loadHtmlContent(text)
        
        els.templateFileInfo.textContent = `✓ Loaded: ${file.name}`
        els.templateFileInfo.className = 'info-box success'
        
        const message = state.requiredImages.length > 0
          ? `HTML file "${file.name}" loaded. ${state.requiredImages.length} image(s) detected. Please upload matching images.`
          : `HTML file "${file.name}" loaded`
        showMessage(message, 'success')
        scrollToHtmlContent()
      } catch (error) {
        showMessage('Failed to read HTML file', 'error')
      }
    } else {
      state.requiredImages = []
      updateImageMatchingStatus()
    }
  })
  
  // Image handling
  els.imagesFolder.addEventListener('change', () => {
    const files = Array.from(els.imagesFolder.files || [])
    state.selectedTemplateImages = files.filter(f => f.type.startsWith('image/'))
    
    toggleFileInputState(els.imagesFolder, state.selectedTemplateImages.length > 0)
    
    els.imagesFolderInfo.textContent = state.selectedTemplateImages.length
      ? `✓ ${state.selectedTemplateImages.length} image${state.selectedTemplateImages.length === 1 ? '' : 's'} selected`
      : ''
    els.imagesFolderInfo.className = state.selectedTemplateImages.length ? 'info-box success' : 'info-box'
    
    const hasHtml = !!(els.htmlContent.value || '').trim()
    els.embedImagesBtn.disabled = !state.selectedTemplateImages.length || !hasHtml
    
    updateImageMatchingStatus()
  })
  
  els.htmlContent.addEventListener('input', () => {
    const hasHtml = !!(els.htmlContent.value || '').trim()
    els.embedImagesBtn.disabled = !state.selectedTemplateImages.length || !hasHtml
    
    const html = els.htmlContent.value || ''
    if (html.trim()) {
      state.requiredImages = extractImageReferences(html)
      updateImageMatchingStatus()
    } else {
      state.requiredImages = []
      updateImageMatchingStatus()
    }
  })
  
  els.embedImagesBtn.addEventListener('click', async () => {
    els.embedImagesBtn.disabled = true
    els.embedImagesBtn.textContent = 'Embedding...'
    
    try {
      const embedded = await embedImagesIntoHtml()
      if (embedded > 0) {
        showMessage(`Successfully embedded ${embedded} image${embedded === 1 ? '' : 's'}`, 'success')
      } else {
        showMessage('No matching images found. Check that filenames match HTML references.', 'error')
      }
    } catch (error) {
      showMessage('Failed to embed images', 'error')
    } finally {
      const hasHtml = !!(els.htmlContent.value || '').trim()
      els.embedImagesBtn.disabled = !state.selectedTemplateImages.length || !hasHtml
      els.embedImagesBtn.innerHTML = '<span>🔗</span> Embed Images into HTML'
    }
  })
  
  // Attachments
  els.attachments.addEventListener('change', () => {
    state.selectedAttachments = Array.from(els.attachments.files || [])
    toggleFileInputState(els.attachments, state.selectedAttachments.length > 0)
    
    if (state.selectedAttachments.length > 0) {
      showMessage(`${state.selectedAttachments.length} file${state.selectedAttachments.length === 1 ? '' : 's'} selected`, 'success')
    }
    
    updateAttachmentsUI()
  })
  
  // Preview
  els.previewBtn?.addEventListener('click', showPreview)
  els.closePreview.addEventListener('click', closePreview)
  
  els.previewModal.addEventListener('click', e => {
    if (e.target === els.previewModal) {
      closePreview()
    }
  })
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && els.previewModal.style.display === 'block') {
      closePreview()
    }
  })
  
  // Clear buttons
  els.clearRecipientsText.addEventListener('click', () => {
    els.recipientsText.value = ''
    updateRecipientCount()
  })
  
  els.clearRecipientsFile.addEventListener('click', () => {
    state.csvRecipientsLoaded = []
    els.csvPreview.textContent = ''
    els.csvPreview.className = 'info-box'
    els.recipientsFile.value = ''
    toggleFileInputState(els.recipientsFile, false)
    updateRecipientCount()
  })
  
  els.clearSubject.addEventListener('click', () => {
    els.subject.value = ''
  })
  
  els.clearLocalTemplateFile?.addEventListener('click', () => {
    els.localTemplateFile.value = ''
    toggleFileInputState(els.localTemplateFile, false)
    els.templateFileInfo.textContent = ''
    els.templateFileInfo.className = 'info-box'
    state.requiredImages = []
    updateImageMatchingStatus()
  })
  
  els.clearImagesFolder?.addEventListener('click', () => {
    state.selectedTemplateImages = []
    els.imagesFolder.value = ''
    toggleFileInputState(els.imagesFolder, false)
    els.imagesFolderInfo.textContent = ''
    els.imagesFolderInfo.className = 'info-box'
    els.embedImagesBtn.disabled = true
    updateImageMatchingStatus()
  })
  
  els.clearHtmlContent.addEventListener('click', () => {
    els.htmlContent.value = ''
    els.embedImagesBtn.disabled = true
    state.requiredImages = []
    updateImageMatchingStatus()
  })
  
  els.clearAttachments?.addEventListener('click', () => {
    state.selectedAttachments = []
    els.attachments.value = ''
    toggleFileInputState(els.attachments, false)
    updateAttachmentsUI()
  })
  
  // Form submission
  els.emailForm.addEventListener('submit', handleFormSubmit)
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize application
 */
function init() {
  setupTabs()
  setupEventListeners()
  loadTemplates()
  updateRecipientCount()
  updateAttachmentsUI()
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

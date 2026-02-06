const fs = require('fs');
const path = require('path');

/**
 * Extract image references from HTML content
 * @param {string} htmlContent - HTML content string
 * @param {string} htmlFilePath - Path to the HTML file (for resolving relative paths)
 * @returns {Array} Array of image objects with src, absolutePath, and filename
 */
function extractImagesFromHTML(htmlContent, htmlFilePath = '') {
  const images = [];
  const htmlDir = htmlFilePath ? path.dirname(htmlFilePath) : '';
  
  // Match all img tags with src attributes
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    
    // Skip data URIs and absolute URLs (http/https)
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
      continue;
    }
    
    // Resolve relative paths
    let absolutePath;
    if (path.isAbsolute(src)) {
      absolutePath = src;
    } else {
      absolutePath = path.resolve(htmlDir, src);
    }
    
    // Check if file exists
    if (fs.existsSync(absolutePath)) {
      const filename = path.basename(src);
      images.push({
        src: src,
        absolutePath: absolutePath,
        filename: filename,
        cid: `img_${images.length}_${Date.now()}`
      });
    }
  }
  
  // Also check for background images in style attributes
  const styleRegex = /style\s*=\s*["'][^"']*background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = styleRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
      continue;
    }
    
    let absolutePath;
    if (path.isAbsolute(src)) {
      absolutePath = src;
    } else {
      absolutePath = path.resolve(htmlDir, src);
    }
    
    if (fs.existsSync(absolutePath)) {
      const filename = path.basename(src);
      // Check if already added
      if (!images.some(img => img.absolutePath === absolutePath)) {
        images.push({
          src: src,
          absolutePath: absolutePath,
          filename: filename,
          cid: `img_${images.length}_${Date.now()}`,
          found: true
        });
      }
    } else {
      // Still add to list but mark as not found
      const filename = path.basename(src);
      if (!images.some(img => img.src === src)) {
        images.push({
          src: src,
          absolutePath: absolutePath,
          filename: filename,
          cid: `img_${images.length}_${Date.now()}`,
          found: false
        });
      }
    }
  }
  
  return images;
}

/**
 * Replace image src attributes with CID references for inline images
 * @param {string} htmlContent - Original HTML content
 * @param {Array} images - Array of image objects with src and cid
 * @returns {string} Modified HTML content with CID references
 */
function replaceImagesWithCID(htmlContent, images) {
  let modifiedHTML = htmlContent;
  
  images.forEach(image => {
    // Replace in img src attributes
    const imgRegex = new RegExp(`(<img[^>]+src\\s*=\\s*["'])${escapeRegex(image.src)}(["'][^>]*>)`, 'gi');
    modifiedHTML = modifiedHTML.replace(imgRegex, `$1cid:${image.cid}$2`);
    
    // Replace in background-image style attributes
    const styleRegex = new RegExp(`(background-image\\s*:\\s*url\\(["']?)${escapeRegex(image.src)}(["']?\\))`, 'gi');
    modifiedHTML = modifiedHTML.replace(styleRegex, `$1cid:${image.cid}$2`);
  });
  
  return modifiedHTML;
}

/**
 * Match image references in HTML with uploaded image files
 * @param {string} htmlContent - HTML content
 * @param {Array} uploadedImages - Array of uploaded image file objects with originalname/path
 * @returns {Array} Array of matched image objects with cid
 */
function matchImagesWithUploads(htmlContent, uploadedImages) {
  const matchedImages = [];
  const imageMap = new Map();
  
  // Create a map of uploaded images by filename (case-insensitive)
  uploadedImages.forEach((file, index) => {
    const filename = file.originalname || path.basename(file.path);
    const lowerFilename = filename.toLowerCase();
    
    // Store both original and lowercase versions
    if (!imageMap.has(lowerFilename)) {
      imageMap.set(lowerFilename, {
        filename: filename,
        path: file.path,
        cid: `img_${index}_${Date.now()}`
      });
    }
  });
  
  // Extract image references from HTML
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const styleRegex = /style\s*=\s*["'][^"']*background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  
  const imageRefs = new Set();
  let match;
  
  // Extract from img tags
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    if (!src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
      imageRefs.add(src);
    }
  }
  
  // Extract from background-image styles
  while ((match = styleRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    if (!src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
      imageRefs.add(src);
    }
  }
  
  // Match references with uploaded files
  imageRefs.forEach(src => {
    const filename = path.basename(src);
    const lowerFilename = filename.toLowerCase();
    
    if (imageMap.has(lowerFilename)) {
      const imageInfo = imageMap.get(lowerFilename);
      matchedImages.push({
        src: src,
        filename: imageInfo.filename,
        path: imageInfo.path,
        cid: imageInfo.cid,
        matched: true
      });
    } else {
      // Try to match by partial filename (without extension)
      const nameWithoutExt = path.parse(lowerFilename).name;
      for (const [key, value] of imageMap.entries()) {
        if (path.parse(key).name === nameWithoutExt) {
          matchedImages.push({
            src: src,
            filename: value.filename,
            path: value.path,
            cid: value.cid,
            matched: true
          });
          break;
        }
      }
    }
  });
  
  return matchedImages;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractImagesFromHTML,
  replaceImagesWithCID,
  matchImagesWithUploads
};

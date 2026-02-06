const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const emailService = require('./src/services/emailService');
const { extractImagesFromHTML, replaceImagesWithCID, matchImagesWithUploads } = require('./src/utils/htmlParser');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
if (!process.env.FROM_EMAIL) {
  console.error('Error: FROM_EMAIL is required in .env file');
  console.error('Please set FROM_EMAIL to your verified SendGrid sender email address');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// CSV parsing helper
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const emails = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed.includes('@')) {
      // Extract email from CSV line (handle quoted values)
      const match = trimmed.match(/"([^"]+)"/) || trimmed.match(/([^\s,;]+@[^\s,;]+)/);
      if (match) {
        const email = match[1] || match[0];
        if (email.includes('@')) {
          emails.push(email.trim());
        }
      } else {
        // Simple split by comma or semicolon
        const parts = trimmed.split(/[,;]/);
        parts.forEach(part => {
          const email = part.trim();
          if (email.includes('@')) {
            emails.push(email);
          }
        });
      }
    }
  }
  
  return [...new Set(emails)]; // Remove duplicates
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Send email endpoint (single or multiple recipients)
app.post('/api/send-email', upload.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'recipientsFile', maxCount: 1 },
  { name: 'localTemplateFile', maxCount: 1 },
  { name: 'templateImages', maxCount: 50 }
]), async (req, res) => {
  try {
    const { to, subject, htmlContent, recipientsText } = req.body;
    
    if (!subject) {
      return res.status(400).json({ 
        error: 'Missing required field: subject is required' 
      });
    }

    let finalHtmlContent = htmlContent || '';
    let htmlImages = [];

    // Process local HTML template file if uploaded
    if (req.files && req.files.localTemplateFile) {
      const htmlFile = req.files.localTemplateFile[0];
      const htmlFilePath = htmlFile.path;
      
      try {
        // Read HTML content from uploaded file
        finalHtmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        
        // Check if template images were uploaded separately
        if (req.files && req.files.templateImages && req.files.templateImages.length > 0) {
          // Match HTML image references with uploaded images
          htmlImages = matchImagesWithUploads(finalHtmlContent, req.files.templateImages);
          
          if (htmlImages.length > 0) {
            // Replace image src with CID references
            htmlImages.forEach(img => {
              const imgRegex = new RegExp(`(<img[^>]+src\\s*=\\s*["'])${img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'][^>]*>)`, 'gi');
              finalHtmlContent = finalHtmlContent.replace(imgRegex, `$1cid:${img.cid}$2`);
              
              const styleRegex = new RegExp(`(background-image\\s*:\\s*url\\(["']?)${img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["']?\\))`, 'gi');
              finalHtmlContent = finalHtmlContent.replace(styleRegex, `$1cid:${img.cid}$2`);
            });
            
            console.log(`Matched ${htmlImages.length} images from uploaded files`);
          } else {
            // Fallback: try to extract images from HTML file location
            htmlImages = extractImagesFromHTML(finalHtmlContent, htmlFilePath);
            if (htmlImages.length > 0) {
              finalHtmlContent = replaceImagesWithCID(finalHtmlContent, htmlImages);
            }
          }
        } else {
          // No separate images uploaded, try to find images relative to HTML file
          htmlImages = extractImagesFromHTML(finalHtmlContent, htmlFilePath);
          if (htmlImages.length > 0) {
            finalHtmlContent = replaceImagesWithCID(finalHtmlContent, htmlImages);
          }
        }
        
        console.log(`Processed HTML template with ${htmlImages.length} images`);
      } catch (error) {
        console.error('Error processing HTML file:', error);
        // Clean up uploaded file
        if (fs.existsSync(htmlFilePath)) {
          fs.unlinkSync(htmlFilePath);
        }
        return res.status(400).json({ 
          error: 'Failed to process HTML file', 
          details: error.message 
        });
      }
    } else if (htmlContent) {
      // HTML content provided as text - try to match with uploaded images
      if (req.files && req.files.templateImages && req.files.templateImages.length > 0) {
        htmlImages = matchImagesWithUploads(htmlContent, req.files.templateImages);
        if (htmlImages.length > 0) {
          htmlImages.forEach(img => {
            const imgRegex = new RegExp(`(<img[^>]+src\\s*=\\s*["'])${img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'][^>]*>)`, 'gi');
            finalHtmlContent = finalHtmlContent.replace(imgRegex, `$1cid:${img.cid}$2`);
            
            const styleRegex = new RegExp(`(background-image\\s*:\\s*url\\(["']?)${img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["']?\\))`, 'gi');
            finalHtmlContent = finalHtmlContent.replace(styleRegex, `$1cid:${img.cid}$2`);
          });
        }
      }
    }

    if (!finalHtmlContent) {
      return res.status(400).json({ 
        error: 'HTML content is required' 
      });
    }

    // Collect recipients from multiple sources
    let recipients = [];
    
    // From CSV file upload
    if (req.files && req.files.recipientsFile) {
      const csvFile = req.files.recipientsFile[0];
      const csvContent = fs.readFileSync(csvFile.path, 'utf8');
      const csvEmails = parseCSV(csvContent);
      recipients = [...recipients, ...csvEmails];
      // Clean up uploaded CSV file
      fs.unlinkSync(csvFile.path);
    }
    
    // From textarea (one per line or comma-separated)
    if (recipientsText) {
      const textEmails = recipientsText
        .split(/[\n,;]/)
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));
      recipients = [...recipients, ...textEmails];
    }
    
    // From "to" field (comma-separated)
    if (to) {
      const toEmails = to.split(',').map(email => email.trim()).filter(email => email);
      recipients = [...recipients, ...toEmails];
    }

    // Remove duplicates
    recipients = [...new Set(recipients)];

    if (recipients.length === 0) {
      return res.status(400).json({ 
        error: 'No valid recipients provided' 
      });
    }

    if (!process.env.FROM_EMAIL) {
      return res.status(500).json({ 
        error: 'Server configuration error: FROM_EMAIL not set in .env file' 
      });
    }

    // Get attachment file paths
    let attachments = req.files && req.files.attachments 
      ? req.files.attachments.map(file => ({
          filename: file.originalname,
          path: file.path,
          disposition: 'attachment'
        }))
      : [];

    // Add matched images from HTML as inline attachments
    htmlImages.forEach(img => {
      if (img.matched || img.found) {
        attachments.push({
          filename: img.filename,
          path: img.path || img.absolutePath,
          cid: img.cid,
          disposition: 'inline'
        });
      }
    });
    
    // Warn about unmatched images
    const unmatchedImages = htmlImages.filter(img => !img.matched && !img.found);
    if (unmatchedImages.length > 0) {
      console.warn(`Warning: ${unmatchedImages.length} image(s) not matched:`, unmatchedImages.map(img => img.src));
    }

    // Use bulk sending for multiple recipients
    if (recipients.length > 1) {
      console.log(`Sending to ${recipients.length} recipients`);
      console.log(`Attachments count: ${attachments.length}`);
      
      const result = await emailService.sendBulkEmails({
        recipients,
        subject,
        html: finalHtmlContent,
        from: process.env.FROM_EMAIL,
        fromName: process.env.FROM_NAME || '',
        attachments,
        batchSize: 100
      });

      console.log(`Send result:`, {
        total: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
        sum: result.successCount + result.failureCount,
        errors: result.errors
      });

      // Validate the counts make sense
      const sum = result.successCount + result.failureCount;
      if (sum !== result.total) {
        console.error(`Count mismatch! Total: ${result.total}, Success: ${result.successCount}, Failed: ${result.failureCount}, Sum: ${sum}`);
        // Fix the counts to match total
        if (result.successCount > result.total) {
          result.successCount = result.total;
          result.failureCount = 0;
        } else if (sum > result.total) {
          result.failureCount = result.total - result.successCount;
        }
      }

      // Include error details in response for debugging
      const errorMessages = result.errors && result.errors.length > 0 
        ? result.errors.map(e => e.error || e.message || 'Unknown error').join('; ')
        : null;

      res.json({ 
        success: result.successCount > 0, 
        message: result.failureCount > 0 
          ? `Emails sent to ${result.successCount} recipients, ${result.failureCount} failed${errorMessages ? ': ' + errorMessages : ''}`
          : `Emails sent to ${result.successCount} recipients`,
        total: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
        errors: result.errors,
        errorMessage: errorMessages
      });
    } else {
      // Single recipient - use regular send
      const emailData = {
        to: recipients[0],
        subject,
        html: finalHtmlContent,
        from: process.env.FROM_EMAIL,
        fromName: process.env.FROM_NAME || '',
        attachments
      };

      const result = await emailService.sendEmail(emailData);

      res.json({ 
        success: true, 
        message: 'Email sent successfully',
        messageId: result.messageId
      });
    }

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message 
    });
  } finally {
    // Clean up uploaded HTML file
    if (req.files && req.files.localTemplateFile) {
      const htmlFilePath = req.files.localTemplateFile[0].path;
      if (fs.existsSync(htmlFilePath)) {
        try {
          fs.unlinkSync(htmlFilePath);
        } catch (err) {
          console.error('Error cleaning up HTML file:', err);
        }
      }
    }
  }
});

// Extract images from HTML endpoint (for preview)
app.post('/api/extract-images', upload.single('htmlFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No HTML file uploaded' });
    }

    const htmlFilePath = req.file.path;
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    const images = extractImagesFromHTML(htmlContent, htmlFilePath);

    // Return image info (without file content)
    const imageInfo = images.map(img => ({
      src: img.src,
      filename: img.filename,
      cid: img.cid,
      exists: fs.existsSync(img.absolutePath)
    }));

    // Clean up uploaded file
    fs.unlinkSync(htmlFilePath);

    res.json({ 
      images: imageInfo,
      count: images.length
    });
  } catch (error) {
    console.error('Error extracting images:', error);
    res.status(500).json({ 
      error: 'Failed to extract images', 
      details: error.message 
    });
  }
});

// Get templates list
app.get('/api/templates', (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates');
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
      return res.json({ templates: [] });
    }

    const files = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.html'))
      .map(file => ({
        name: file,
        path: path.join(templatesDir, file)
      }));

    res.json({ templates: files });
  } catch (error) {
    console.error('Error reading templates:', error);
    res.status(500).json({ error: 'Failed to read templates' });
  }
});

// Get template content
app.get('/api/templates/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const templatePath = path.join(__dirname, 'templates', filename);
    
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const content = fs.readFileSync(templatePath, 'utf8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading template:', error);
    res.status(500).json({ error: 'Failed to read template' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

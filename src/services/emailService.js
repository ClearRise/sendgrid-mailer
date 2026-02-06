const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

// Initialize SendGrid
if (!process.env.SENDGRID_API_KEY) {
  console.warn('Warning: SENDGRID_API_KEY is not set in environment variables');
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * Send email using SendGrid
 * @param {Object} emailData - Email data object
 * @param {string|string[]} emailData.to - Recipient email(s)
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.from - Sender email
 * @param {string} emailData.fromName - Sender name
 * @param {Array} emailData.attachments - Array of attachment objects with filename and path
 * @returns {Promise<Object>} SendGrid response
 */
async function sendEmail(emailData) {
  try {
    const { to, subject, html, from, fromName, attachments = [] } = emailData;

    // Prepare attachment data
    const attachmentData = [];
    for (const att of attachments) {
      try {
        if (!fs.existsSync(att.path)) {
          console.warn(`Attachment file not found: ${att.path}`);
          continue;
        }
        
        const fileContent = fs.readFileSync(att.path);
        const attachment = {
          content: fileContent.toString('base64'),
          filename: att.filename,
          type: getMimeType(att.path),
          disposition: att.disposition || 'attachment'
        };
        
        // Add content_id for inline images
        if (att.cid) {
          attachment.content_id = att.cid;
        }
        
        attachmentData.push(attachment);
      } catch (error) {
        console.error(`Error reading attachment ${att.filename}:`, error);
        // Continue with other attachments
      }
    }

    const msg = {
      to: Array.isArray(to) ? to : [to],
      from: {
        email: from,
        name: fromName || ''
      },
      subject: subject,
      html: html,
      attachments: attachmentData
    };

    const response = await sgMail.send(msg);
    
    return {
      success: true,
      messageId: response[0].headers['x-message-id'] || 'unknown',
      statusCode: response[0].statusCode
    };

  } catch (error) {
    console.error('SendGrid Error:', error);
    if (error.response) {
      console.error('Error details:', error.response.body);
    }
    throw error;
  }
}

/**
 * Get MIME type based on file extension
 * @param {string} filePath - Path to the file
 * @returns {string} MIME type
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.zip': 'application/zip'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Send emails to multiple recipients in batches
 * @param {Object} emailData - Email data object
 * @param {string[]} emailData.recipients - Array of recipient emails
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.from - Sender email
 * @param {string} emailData.fromName - Sender name
 * @param {Array} emailData.attachments - Array of attachment objects
 * @param {number} emailData.batchSize - Number of emails per batch (default: 100)
 * @param {Function} emailData.progressCallback - Callback function for progress updates
 * @returns {Promise<Object>} Results object with success/failure counts
 */
async function sendBulkEmails(emailData) {
  try {
    const { 
      recipients, 
      subject, 
      html, 
      from, 
      fromName, 
      attachments = [],
      batchSize = 100,
      progressCallback
    } = emailData;

    console.log("send email: ", emailData);
    
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    // Validate and clean email addresses
    const validRecipients = recipients
      .map(email => email.trim())
      .filter(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      });

    if (validRecipients.length === 0) {
      throw new Error('No valid email addresses found');
    }

    const totalRecipients = validRecipients.length;
    let successCount = 0;
    let failureCount = 0;
    const errors = [];
    
    console.log(`Starting bulk send to ${totalRecipients} recipients`);

    // Prepare attachment data once
    const attachmentData = [];
    for (const att of attachments) {
      try {
        if (!fs.existsSync(att.path)) {
          console.warn(`Attachment file not found: ${att.path}`);
          continue;
        }
        
        const fileContent = fs.readFileSync(att.path);
        const attachment = {
          content: fileContent.toString('base64'),
          filename: att.filename,
          type: getMimeType(att.path),
          disposition: att.disposition || 'attachment'
        };
        
        // Add content_id for inline images
        if (att.cid) {
          attachment.content_id = att.cid;
        }
        
        attachmentData.push(attachment);
      } catch (error) {
        console.error(`Error reading attachment ${att.filename}:`, error);
        // Continue with other attachments
      }
    }

    // Process in batches to avoid rate limits
    for (let i = 0; i < validRecipients.length; i += batchSize) {
      const batch = validRecipients.slice(i, i + batchSize);
      
      try {
        const msg = {
          to: batch,
          from: {
            email: from,
            name: fromName || ''
          },
          subject: subject,
          html: html,
          attachments: attachmentData
        };

        console.log(`Sending batch ${Math.floor(i/batchSize) + 1} to ${batch.length} recipients:`, batch);
        const response = await sgMail.send(msg);
        
        // SendGrid returns 202 Accepted for successful sends
        // Response is an array, check first element
        if (response && Array.isArray(response) && response.length > 0) {
          const statusCode = response[0].statusCode;
          if (statusCode === 202 || statusCode === 200) {
            successCount += batch.length;
            console.log(`✓ Batch sent successfully. Status: ${statusCode}, Message ID: ${response[0].headers['x-message-id'] || 'N/A'}`);
          } else {
            console.warn(`⚠ Unexpected response status: ${statusCode}`, response);
            failureCount += batch.length;
            errors.push({
              batch: batch,
              error: `Unexpected status code: ${statusCode}`,
              response: response
            });
          }
        } else {
          console.warn(`⚠ Invalid response format:`, response);
          failureCount += batch.length;
          errors.push({
            batch: batch,
            error: 'Invalid response format',
            response: response
          });
        }

        if (progressCallback) {
          progressCallback({
            processed: Math.min(i + batchSize, totalRecipients),
            total: totalRecipients,
            success: successCount,
            failed: failureCount
          });
        }

        // Small delay between batches to respect rate limits
        if (i + batchSize < validRecipients.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error sending batch to ${batch.length} recipients:`, error);
        let errorDetails = error.message;
        
        if (error.response) {
          const responseBody = error.response.body;
          console.error('SendGrid API Error Details:', {
            statusCode: error.code || error.response.statusCode,
            body: responseBody,
            headers: error.response.headers
          });
          
          // Extract detailed error messages
          if (responseBody && responseBody.errors && Array.isArray(responseBody.errors)) {
            const errorMessages = responseBody.errors.map(err => {
              return err.message || JSON.stringify(err);
            }).join('; ');
            errorDetails = `${error.message}: ${errorMessages}`;
            console.error('SendGrid Error Messages:', errorMessages);
          }
        }
        
        failureCount += batch.length;
        errors.push({
          batch: batch,
          error: errorDetails,
          code: error.code,
          details: error.response ? error.response.body : undefined
        });

        if (progressCallback) {
          progressCallback({
            processed: Math.min(i + batchSize, totalRecipients),
            total: totalRecipients,
            success: successCount,
            failed: failureCount
          });
        }
      }
    }

    // Final validation
    const finalSum = successCount + failureCount;
    if (finalSum !== totalRecipients) {
      console.error(`Final count mismatch! Expected: ${totalRecipients}, Got: ${finalSum} (Success: ${successCount}, Failed: ${failureCount})`);
      // Adjust failure count to match total
      if (finalSum < totalRecipients) {
        failureCount = totalRecipients - successCount;
      } else if (finalSum > totalRecipients) {
        // This shouldn't happen, but if it does, cap the counts
        const excess = finalSum - totalRecipients;
        if (successCount > totalRecipients) {
          successCount = totalRecipients;
          failureCount = 0;
        } else {
          failureCount = totalRecipients - successCount;
        }
      }
    }
    
    console.log(`Bulk send completed. Total: ${totalRecipients}, Success: ${successCount}, Failed: ${failureCount}`);
    
    return {
      success: successCount > 0,
      total: totalRecipients,
      successCount,
      failureCount,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error('Bulk Send Error:', error);
    throw error;
  }
}

module.exports = {
  sendEmail,
  sendBulkEmails
};

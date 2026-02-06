# SendGrid Email Sender

A clean and simple email sender application using SendGrid API with support for HTML templates and image attachments. Features a user-friendly dashboard for selecting templates and files from your local machine.

## Features

- 📧 Send emails via SendGrid API
- 📬 **Bulk email sending** - Send to hundreds of recipients at once
- 📄 **CSV file support** - Upload CSV files with recipient lists
- 🎨 HTML email template support
- 📁 **Local HTML file selection** - Select HTML templates from your computer
- 🖼️ **Automatic image extraction** - Images in HTML files are automatically extracted and attached
- 📎 Image and file attachments
- 🖥️ Simple web dashboard
- 👀 HTML preview functionality
- 📊 Progress tracking for bulk sends
- ✨ Clean, modern UI

## Project Structure

```
sendgrid-mailer/
├── server.js                 # Express server
├── package.json              # Dependencies
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore file
├── README.md                # This file
├── src/
│   └── services/
│       └── emailService.js  # SendGrid email service
├── public/
│   ├── index.html           # Dashboard HTML
│   ├── styles.css           # Dashboard styles
│   └── app.js               # Dashboard JavaScript
├── templates/               # HTML email templates (create this folder)
└── uploads/                 # Temporary file uploads (auto-created)
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your SendGrid API key:

```bash
cp .env.example .env
```

Edit `.env` file:
```env
SENDGRID_API_KEY=your_sendgrid_api_key_here
PORT=3000
FROM_EMAIL=your-verified-email@example.com
FROM_NAME=Your Name
```

**Important**: The `FROM_EMAIL` must be a verified sender email address in your SendGrid account. You can only send emails from addresses that are verified in SendGrid.

### 3. Get SendGrid API Key and Verify Sender

1. Sign up for a free SendGrid account at [sendgrid.com](https://sendgrid.com)
2. Go to Settings → API Keys
3. Create a new API key with "Full Access" or "Mail Send" permissions
4. Copy the API key and paste it into your `.env` file
5. **Verify your sender email**: Go to Settings → Sender Authentication and verify the email address you want to use as the sender
6. Use that verified email address as `FROM_EMAIL` in your `.env` file

### 4. Create Templates Folder

Create a `templates` folder in the project root and add your HTML email templates:

```bash
mkdir templates
```

Place your HTML template files (`.html` extension) in this folder. They will appear in the dashboard's template selector.

### 5. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## Usage

1. **Open the Dashboard**: Navigate to `http://localhost:3000` in your browser

2. **Fill Email Details**:
   - Enter email subject
   - The sender email is automatically set from your `.env` configuration (must be verified in SendGrid)

3. **Add Recipients** (Choose one method):
   - **Manual Entry**: Switch to "Manual Entry" tab and enter email addresses (one per line or comma-separated)
   - **CSV Upload**: Switch to "Upload CSV" tab and upload a CSV file with email addresses
   - You can see the recipient count in real-time

4. **Select HTML Template** (Choose one method):
   - **From Server**: Choose a template from the dropdown (templates from `templates/` folder) and click "Load Template"
   - **From Local Computer**: Switch to "From Local Computer" tab, select an HTML file from your computer
   - Images referenced in the HTML (using relative paths) will be automatically extracted and attached as inline images
   - You can edit the HTML content after loading

5. **Add Attachments**:
   - Click "Select Images/Files" to choose files from your local machine
   - Selected files will appear below
   - Remove files by clicking the × button

6. **Preview (Optional)**:
   - Click "Preview HTML" to see how your email will look

7. **Send Email**:
   - Click "Send Email" button
   - For bulk sends, a progress modal will show the sending status
   - Wait for confirmation message

### Bulk Sending

The application supports sending emails to many recipients efficiently:

- **Manual Entry**: Paste multiple email addresses in the textarea (one per line or comma-separated)
- **CSV Upload**: Upload a CSV file with email addresses. Each line should contain one email address
- **Batch Processing**: Emails are sent in batches of 100 to respect SendGrid rate limits
- **Progress Tracking**: Real-time progress bar shows how many emails have been sent
- **Error Handling**: Failed sends are tracked and reported separately

**CSV Format Example:**
```csv
email@example.com
user1@example.com
user2@example.com
user3@example.com
```

Or with headers:
```csv
email
user@example.com
admin@example.com
```

## Example HTML Template

Create a file `templates/welcome.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome!</h1>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>Thank you for joining us!</p>
            <p><a href="#" class="button">Get Started</a></p>
        </div>
    </div>
</body>
</html>
```

## API Endpoints

### POST `/api/send-email`
Send an email with HTML content and attachments.

**Form Data:**
- `subject` (required): Email subject
- `htmlContent` (required): HTML content
- `recipientsText` (optional): Recipient emails from textarea (one per line or comma-separated)
- `recipientsFile` (optional): CSV file with recipient emails
- `attachments` (optional): File attachments

**Note**: The sender email (`FROM_EMAIL`) is automatically set from the `.env` file and must be verified in SendGrid.

### GET `/api/templates`
Get list of available HTML templates.

### GET `/api/templates/:filename`
Get content of a specific template.

## Notes

- Maximum file size per attachment: 10MB
- Maximum number of attachments: 10 files
- Templates must be `.html` files in the `templates/` folder (for server templates)
- Uploaded files are temporarily stored in `uploads/` folder
- Make sure your SendGrid account is verified and has sending permissions
- Bulk emails are sent in batches of 100 to avoid rate limits
- Duplicate email addresses are automatically removed
- Invalid email addresses are filtered out automatically

### Image Handling in HTML Templates

When you select an HTML file from your local computer:

**Option 1: Select Images Folder/Files Separately (Recommended)**
1. Select your HTML file
2. Select your images folder or individual image files using the "Images Folder/Files" input
3. The system automatically matches image references in HTML with uploaded images by filename
4. Matched images are embedded as inline images using CID references
5. HTML content is automatically updated to use `cid:` references

**Option 2: Images in Same Folder as HTML**
- If images are in the same folder as the HTML file, they will be automatically found
- Images referenced with relative paths (e.g., `images/logo.png` or `./logo.png`) are extracted

**How Image Matching Works:**
- The system extracts image references from `<img src="...">` tags and `background-image` CSS
- Matches them with uploaded images by filename (case-insensitive)
- Converts matched images to inline attachments with CID (Content-ID) references
- Updates HTML to use `cid:` URLs so images render directly in the email
- Data URIs and HTTP/HTTPS URLs are left unchanged

**Example:**
- HTML file references: `<img src="logo.png">` and `<img src="images/banner.jpg">`
- Upload images folder containing: `logo.png`, `banner.jpg`
- Result: Both images are matched, embedded, and will render in the email

## Troubleshooting

**Error: "SENDGRID_API_KEY is not set"**
- Make sure you've created a `.env` file with your API key

**Error: "Failed to send email"**
- Verify your SendGrid API key is correct
- Check that your SendGrid account is active
- Ensure the sender email is verified in SendGrid

**Templates not showing**
- Make sure the `templates/` folder exists
- Ensure template files have `.html` extension
- Check file permissions

## License

MIT

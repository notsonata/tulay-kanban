# Storage Migration Guide: Local to Cloudflare R2

This guide explains how to migrate from local file storage to Cloudflare R2 for storing task images.

## Current Setup (Local Storage)

By default, the application uses local filesystem storage. Images are stored in the `uploads/` directory and served via the `/uploads` route.

## Why Cloudflare R2?

Cloudflare R2 is an S3-compatible object storage service that offers:
- Zero egress fees (free data transfer out)
- High availability and durability
- CDN integration for fast global delivery
- Scalable storage without managing disks
- Cost-effective pricing ($0.015/GB/month)

## Migration Steps

### 1. Create a Cloudflare R2 Bucket

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the sidebar
3. Click **Create bucket**
4. Choose a bucket name (e.g., `kanban-images`)
5. Select your preferred region
6. Click **Create bucket**

### 2. Configure Public Access (Optional)

To serve images publicly:

1. Go to your bucket settings
2. Click **Settings** > **Public Access**
3. Enable **Allow Access** and note the public URL
4. Or set up a custom domain for your bucket

### 3. Generate R2 API Tokens

1. In the Cloudflare dashboard, go to **R2** > **Manage R2 API Tokens**
2. Click **Create API Token**
3. Give it a name (e.g., `kanban-app`)
4. Set permissions to **Object Read & Write**
5. Select your bucket
6. Click **Create API Token**
7. **Important:** Save the Access Key ID and Secret Access Key (you won't see them again)

### 4. Install Required Dependencies

Uncomment `boto3` in `requirements.txt`:

```bash
pip install boto3
```

### 5. Configure Environment Variables

Create a `.env` file (or update your existing one) with:

```bash
# Storage Configuration
STORAGE_BACKEND=r2

# Cloudflare R2 Settings
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=kanban-images
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxx.r2.dev
```

**Finding your Account ID:**
- Go to Cloudflare Dashboard
- It's in the URL: `dash.cloudflare.com/YOUR_ACCOUNT_ID`
- Or check R2 overview page

**Getting the Public URL:**
- In your bucket settings, look for "Public bucket URL"
- Or use a custom domain if configured

### 6. Update Application to Load Environment Variables

If not already done, ensure your application loads the `.env` file. Add this near the top of `main.py`:

```python
from dotenv import load_dotenv
load_dotenv()
```

Then install python-dotenv:
```bash
pip install python-dotenv
```

### 7. Restart the Application

```bash
python main.py
```

The application will now use Cloudflare R2 for new image uploads!

## Migrating Existing Images

If you have existing images in local storage, you can migrate them to R2:

### Option 1: Manual Upload

1. Use the Cloudflare dashboard to upload files from the `uploads/` folder
2. Update the database to replace local URLs with R2 URLs

### Option 2: Migration Script

Create a migration script (`migrate_images_to_r2.py`):

```python
import os
from pathlib import Path
from backend.storage import CloudflareR2Storage, LocalFileStorage
from backend.database import SessionLocal
from backend.models import Task

# Initialize storage backends
local_storage = LocalFileStorage(
    upload_dir=Path("uploads"),
    base_url=""
)

r2_storage = CloudflareR2Storage(
    account_id=os.getenv('R2_ACCOUNT_ID'),
    access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
    secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
    bucket_name=os.getenv('R2_BUCKET_NAME'),
    public_url=os.getenv('R2_PUBLIC_URL')
)

async def migrate_images():
    db = SessionLocal()
    try:
        tasks = db.query(Task).all()
        
        for task in tasks:
            if not task.images:
                continue
                
            new_images = []
            for image_url in task.images:
                if image_url.startswith('/uploads/'):
                    # Local file - migrate to R2
                    filename = image_url.split('/')[-1]
                    local_path = Path('uploads') / filename
                    
                    if local_path.exists():
                        with open(local_path, 'rb') as f:
                            # Determine content type
                            ext = filename.split('.')[-1].lower()
                            content_type = {
                                'jpg': 'image/jpeg',
                                'jpeg': 'image/jpeg',
                                'png': 'image/png',
                                'gif': 'image/gif',
                                'webp': 'image/webp'
                            }.get(ext, 'image/jpeg')
                            
                            # Upload to R2
                            r2_url = await r2_storage.upload_file(
                                file=f,
                                filename=filename,
                                content_type=content_type
                            )
                            new_images.append(r2_url)
                            print(f"Migrated: {filename} -> {r2_url}")
                    else:
                        # File not found, keep original URL
                        new_images.append(image_url)
                else:
                    # Already an R2 URL or external URL
                    new_images.append(image_url)
            
            task.images = new_images
        
        db.commit()
        print("Migration complete!")
    finally:
        db.close()

if __name__ == '__main__':
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(migrate_images())
```

Run the migration:
```bash
python migrate_images_to_r2.py
```

## Testing

After migration, test that:
1. New image uploads work correctly
2. Existing images are displayed properly
3. Image deletion works (if implemented)
4. Images load quickly from R2

## Switching Back to Local Storage

If needed, you can switch back by setting:
```bash
STORAGE_BACKEND=local
```

## Cost Estimation

**Cloudflare R2 Pricing:**
- Storage: $0.015/GB/month
- Class A operations (writes): $4.50/million
- Class B operations (reads): $0.36/million
- Egress: **FREE** 🎉

**Example for small-medium usage:**
- 10GB of images: $0.15/month
- 10,000 uploads: $0.045
- 100,000 views: $0.036
- **Total: ~$0.23/month**

## Troubleshooting

**Error: "boto3 is required for Cloudflare R2 storage"**
- Solution: Install boto3: `pip install boto3`

**Error: "R2 storage requires environment variables"**
- Solution: Ensure all R2_* variables are set in your .env file

**Images not loading:**
- Check that your R2 bucket has public access enabled
- Verify the R2_PUBLIC_URL is correct
- Check browser console for CORS errors

**CORS errors:**
- Configure CORS in your R2 bucket settings:
  ```json
  [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
  ```

## Additional Features

Consider implementing:
- Image compression before upload
- Automatic thumbnail generation
- Image lazy loading on frontend
- CDN caching headers
- Signed URLs for private images
- Automatic cleanup of orphaned images

## Support

For Cloudflare R2 specific issues:
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [R2 API Reference](https://developers.cloudflare.com/r2/api/)
- [Cloudflare Community](https://community.cloudflare.com/)

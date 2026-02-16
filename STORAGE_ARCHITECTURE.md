# Image Storage Architecture

## Overview

The application now uses a **storage abstraction layer** that supports multiple storage backends. This makes it easy to migrate from local filesystem storage to cloud storage services like Cloudflare R2.

## Architecture

```
┌─────────────────────────────────────┐
│         FastAPI Application         │
│         (main.py)                   │
└───────────────┬─────────────────────┘
                │
                │ uses
                ▼
┌─────────────────────────────────────┐
│      Storage Backend Interface      │
│      (backend/storage.py)           │
│                                     │
│  - upload_file()                    │
│  - delete_file()                    │
│  - get_file_path_from_url()         │
└───────────────┬─────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐  ┌────────────────────┐
│   Local      │  │  Cloudflare R2     │
│   Storage    │  │  Storage           │
└──────────────┘  └────────────────────┘
```

## Files Added/Modified

### New Files

1. **`backend/storage.py`** - Storage abstraction layer
   - `StorageBackend` - Abstract base class
   - `LocalFileStorage` - Local filesystem implementation
   - `CloudflareR2Storage` - Cloudflare R2 implementation
   - `get_storage_backend()` - Factory function

2. **`.env.example`** - Environment variables template
   - Shows all configuration options
   - Documents R2 setup requirements

3. **`STORAGE_MIGRATION.md`** - Migration guide
   - Step-by-step R2 setup instructions
   - Cost estimation
   - Testing procedures
   - Troubleshooting tips

4. **`STORAGE_ARCHITECTURE.md`** (this file)
   - Architecture overview
   - Implementation details

### Modified Files

1. **`main.py`**
   - Added `from backend.storage import get_storage_backend`
   - Initialize storage backend: `storage = get_storage_backend()`
   - Updated `/api/upload-image` endpoint to use storage backend
   - Added file size validation (5MB limit)

2. **`requirements.txt`**
   - Added boto3 as optional dependency (commented out)
   - Documented when to install it

## Storage Backend Selection

The storage backend is selected via the `STORAGE_BACKEND` environment variable:

```python
# .env file
STORAGE_BACKEND=local  # or 'r2'
```

### Local Storage (Default)

**Configuration:**
```bash
STORAGE_BACKEND=local
BASE_URL=http://localhost:8000
```

**Behavior:**
- Files saved to `uploads/` directory
- URLs: `/uploads/filename.ext`
- Served via FastAPI StaticFiles mount

**Pros:**
- Simple setup
- No external dependencies
- No cost
- Fast for development

**Cons:**
- Not scalable
- Files lost if server crashes
- No CDN benefits
- Bandwidth costs

### Cloudflare R2 Storage

**Configuration:**
```bash
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

**Behavior:**
- Files uploaded to R2 bucket
- URLs: `https://pub-xxx.r2.dev/images/2026/02/uuid.jpg`
- Organized by year/month
- S3-compatible API via boto3

**Pros:**
- Zero egress fees
- Highly available
- CDN integration
- Scalable
- Global delivery

**Cons:**
- Requires setup
- External dependency (boto3)
- Small monthly cost

## Implementation Details

### Storage Interface

All storage backends implement three methods:

```python
class StorageBackend(ABC):
    async def upload_file(self, file: BinaryIO, filename: str, content_type: str) -> str:
        """Upload a file and return its public URL"""
        pass
    
    async def delete_file(self, url: str) -> bool:
        """Delete a file by URL"""
        pass
    
    def get_file_path_from_url(self, url: str) -> str:
        """Extract file path/key from URL"""
        pass
```

### File Upload Flow

1. User clicks "Add Image" in task panel
2. Frontend validates file (type, size)
3. POST to `/api/upload-image` with multipart form data
4. Backend validates request (auth, file type, size)
5. Storage backend processes upload:
   - **Local**: Saves to disk, returns `/uploads/filename`
   - **R2**: Uploads via boto3, returns `https://...`
6. URL returned to frontend
7. Frontend adds URL to task images array
8. User clicks "Save Changes"
9. Task updated with image URLs in database

### File Organization

**Local Storage:**
```
uploads/
  ├── 1708123456.789_uuid1.jpg
  ├── 1708123500.123_uuid2.png
  └── ...
```

**R2 Storage:**
```
bucket/
  └── images/
      └── 2026/
          └── 02/
              ├── uuid1.jpg
              ├── uuid2.png
              └── ...
```

## Security Considerations

### File Validation

- **Type checking**: Only JPEG, PNG, GIF, WebP allowed
- **Size limit**: 5MB maximum
- **Authentication**: Login required for uploads

### File Naming

- Unique filenames prevent collisions
- Timestamp + UUID format
- No user-controlled paths

### Access Control

- **Local**: Public via `/uploads` route
- **R2**: Public bucket or signed URLs

## Future Enhancements

Consider implementing:

1. **Image Processing**
   - Automatic thumbnail generation
   - Format conversion (WebP)
   - Compression/optimization

2. **CDN Integration**
   - Cloudflare CDN configuration
   - Cache headers optimization
   - Custom domain setup

3. **Advanced Features**
   - Private images with signed URLs
   - Image metadata extraction
   - Duplicate detection
   - Orphaned file cleanup

4. **Monitoring**
   - Upload success/failure tracking
   - Storage usage metrics
   - Cost monitoring

5. **Additional Backends**
   - AWS S3
   - Google Cloud Storage
   - Azure Blob Storage
   - Backblaze B2

## Testing

### Local Storage
```bash
# Default - no config needed
python main.py
```

### R2 Storage
```bash
# Set environment variables
export STORAGE_BACKEND=r2
export R2_ACCOUNT_ID=xxx
export R2_ACCESS_KEY_ID=xxx
export R2_SECRET_ACCESS_KEY=xxx
export R2_BUCKET_NAME=xxx
export R2_PUBLIC_URL=xxx

# Or use .env file
python main.py
```

## Troubleshooting

See [STORAGE_MIGRATION.md](STORAGE_MIGRATION.md) for detailed troubleshooting steps.

### Common Issues

**"boto3 is required for Cloudflare R2 storage"**
- Install: `pip install boto3`

**"R2 storage requires environment variables"**
- Check `.env` file has all R2_* variables

**Images not loading**
- Verify bucket public access settings
- Check CORS configuration
- Validate R2_PUBLIC_URL

## Summary

The storage abstraction provides:
- ✅ Flexible storage backend selection
- ✅ Easy migration path to R2
- ✅ No breaking changes to existing code
- ✅ Backward compatible with local storage
- ✅ Future-proof architecture
- ✅ Cost optimization ready

To migrate to R2, simply:
1. Create R2 bucket
2. Install boto3
3. Set environment variables
4. Restart application

No code changes required! 🚀

# Storage Quick Reference

## Current Setup ✅

**Default:** Local filesystem storage  
**Location:** `uploads/` directory  
**No configuration needed** - works out of the box!

## Switch to Cloudflare R2

### 1. Install boto3
```bash
pip install boto3
```

### 2. Set environment variables
```bash
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret
R2_BUCKET_NAME=your-bucket
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

### 3. Restart app
```bash
python main.py
```

That's it! 🎉

## Files to Know

| File | Purpose |
|------|---------|
| `backend/storage.py` | Storage abstraction layer |
| `.env.example` | Configuration template |
| `STORAGE_MIGRATION.md` | Full migration guide |
| `STORAGE_ARCHITECTURE.md` | Technical details |

## Key Features

✅ Zero code changes to switch backends  
✅ 5MB file size limit  
✅ Supports JPEG, PNG, GIF, WebP  
✅ Automatic unique filenames  
✅ Authentication required for uploads  

## API Endpoint

**POST** `/api/upload-image`
- **Auth:** Required (Bearer token)
- **Body:** multipart/form-data with `file` field
- **Returns:** `{"url": "..."}`

## Cost Comparison

| Storage | Cost | Egress | Setup |
|---------|------|--------|-------|
| **Local** | Free | Bandwidth costs | None |
| **R2** | $0.015/GB/month | **FREE** 🎉 | 5 minutes |

## Need Help?

- **Setup R2:** See `STORAGE_MIGRATION.md`
- **Architecture:** See `STORAGE_ARCHITECTURE.md`
- **Configuration:** See `.env.example`

## Pro Tips 💡

1. Use R2 for production (free egress!)
2. Use local for development (simpler)
3. Migrate existing images with provided script
4. Set up custom domain for R2 bucket
5. Enable CORS for cross-origin access

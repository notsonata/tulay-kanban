"""
Storage abstraction layer for file uploads
Supports local filesystem and can be extended for Cloudflare R2
"""

import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO, Optional
import datetime
import uuid


class StorageBackend(ABC):
    """Abstract base class for storage backends"""
    
    @abstractmethod
    async def upload_file(self, file: BinaryIO, filename: str, content_type: str) -> str:
        """
        Upload a file and return its URL
        
        Args:
            file: Binary file object
            filename: Name of the file
            content_type: MIME type of the file
            
        Returns:
            Public URL of the uploaded file
        """
        pass
    
    @abstractmethod
    async def delete_file(self, url: str) -> bool:
        """
        Delete a file by its URL
        
        Args:
            url: Public URL of the file
            
        Returns:
            True if successful, False otherwise
        """
        pass
    
    @abstractmethod
    def get_file_path_from_url(self, url: str) -> str:
        """
        Extract the file path/key from a URL
        
        Args:
            url: Public URL of the file
            
        Returns:
            File path or key
        """
        pass


class LocalFileStorage(StorageBackend):
    """Local filesystem storage implementation"""
    
    def __init__(self, upload_dir: Path, base_url: str = ""):
        """
        Initialize local file storage
        
        Args:
            upload_dir: Directory to store uploaded files
            base_url: Base URL for serving files (e.g., "http://localhost:8000")
        """
        self.upload_dir = upload_dir
        self.base_url = base_url
        
        # Create upload directory if it doesn't exist
        self.upload_dir.mkdir(parents=True, exist_ok=True)
    
    async def upload_file(self, file: BinaryIO, filename: str, content_type: str) -> str:
        """Upload file to local filesystem"""
        # Generate unique filename
        file_extension = filename.split(".")[-1]
        unique_filename = f"{datetime.datetime.utcnow().timestamp()}_{uuid.uuid4()}.{file_extension}"
        file_path = self.upload_dir / unique_filename
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file, buffer)
        
        # Return public URL
        return f"{self.base_url}/uploads/{unique_filename}"
    
    async def delete_file(self, url: str) -> bool:
        """Delete file from local filesystem"""
        try:
            filename = self.get_file_path_from_url(url)
            file_path = self.upload_dir / filename
            
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception as e:
            print(f"Error deleting file: {e}")
            return False
    
    def get_file_path_from_url(self, url: str) -> str:
        """Extract filename from URL"""
        return url.split("/uploads/")[-1]


class CloudflareR2Storage(StorageBackend):
    """
    Cloudflare R2 storage implementation
    
    To use this backend:
    1. Install boto3: pip install boto3
    2. Set environment variables:
       - R2_ACCOUNT_ID: Your Cloudflare account ID
       - R2_ACCESS_KEY_ID: R2 access key
       - R2_SECRET_ACCESS_KEY: R2 secret key
       - R2_BUCKET_NAME: Name of your R2 bucket
       - R2_PUBLIC_URL: Public URL of your bucket (e.g., https://pub-xxx.r2.dev)
    """
    
    def __init__(
        self,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket_name: str,
        public_url: str
    ):
        """
        Initialize Cloudflare R2 storage
        
        Args:
            account_id: Cloudflare account ID
            access_key_id: R2 access key ID
            secret_access_key: R2 secret access key
            bucket_name: Name of the R2 bucket
            public_url: Public URL for accessing files
        """
        self.bucket_name = bucket_name
        self.public_url = public_url.rstrip('/')
        
        try:
            import boto3  # type: ignore
        except ImportError:
            raise ImportError(
                "boto3 is required for Cloudflare R2 storage. "
                "Install it with: pip install boto3"
            )
        
        # R2 uses S3-compatible API
        self.s3_client = boto3.client(  # type: ignore
            's3',
            endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name='auto'  # R2 uses 'auto' for region
        )
    
    async def upload_file(self, file: BinaryIO, filename: str, content_type: str) -> str:
        """Upload file to Cloudflare R2"""
        # Generate unique key
        file_extension = filename.split(".")[-1]
        file_key = f"images/{datetime.datetime.utcnow().strftime('%Y/%m')}/{uuid.uuid4()}.{file_extension}"
        
        # Upload to R2
        file.seek(0)  # Reset file pointer
        self.s3_client.upload_fileobj(
            file,
            self.bucket_name,
            file_key,
            ExtraArgs={
                'ContentType': content_type,
                'CacheControl': 'public, max-age=31536000'  # Cache for 1 year
            }
        )
        
        # Return public URL
        return f"{self.public_url}/{file_key}"
    
    async def delete_file(self, url: str) -> bool:
        """Delete file from Cloudflare R2"""
        try:
            file_key = self.get_file_path_from_url(url)
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=file_key)
            return True
        except Exception as e:
            print(f"Error deleting file from R2: {e}")
            return False
    
    def get_file_path_from_url(self, url: str) -> str:
        """Extract file key from URL"""
        # Remove the public URL prefix to get the key
        return url.replace(f"{self.public_url}/", "")


def get_storage_backend() -> StorageBackend:
    """
    Factory function to get the appropriate storage backend based on configuration
    
    Environment variables:
    - STORAGE_BACKEND: 'local' or 'r2' (default: 'local')
    
    For R2 backend, also set:
    - R2_ACCOUNT_ID
    - R2_ACCESS_KEY_ID
    - R2_SECRET_ACCESS_KEY
    - R2_BUCKET_NAME
    - R2_PUBLIC_URL
    """
    storage_type = os.getenv('STORAGE_BACKEND', 'local').lower()
    
    if storage_type == 'r2':
        # Initialize Cloudflare R2 storage
        account_id = os.getenv('R2_ACCOUNT_ID')
        access_key_id = os.getenv('R2_ACCESS_KEY_ID')
        secret_access_key = os.getenv('R2_SECRET_ACCESS_KEY')
        bucket_name = os.getenv('R2_BUCKET_NAME')
        public_url = os.getenv('R2_PUBLIC_URL')
        
        if not all([account_id, access_key_id, secret_access_key, bucket_name, public_url]):
            raise ValueError(
                "R2 storage requires environment variables: "
                "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, "
                "R2_BUCKET_NAME, R2_PUBLIC_URL"
            )
        
        # Type assertions for mypy/type checkers
        assert account_id is not None
        assert access_key_id is not None
        assert secret_access_key is not None
        assert bucket_name is not None
        assert public_url is not None
        
        return CloudflareR2Storage(
            account_id=account_id,
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
            bucket_name=bucket_name,
            public_url=public_url
        )
    else:
        # Default to local filesystem storage
        from pathlib import Path
        upload_dir = Path(__file__).parent.parent / "uploads"
        base_url = os.getenv('BASE_URL', '')
        return LocalFileStorage(upload_dir=upload_dir, base_url=base_url)

import { useState } from 'react'
import { useWordPressAuth } from '../hooks/useWordPressAuth'
import './ImageUploader.css'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

export default function ImageUploader({ onImagesUploaded, maxImages = 3 }) {
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [error, setError] = useState('')
  const { getAuthHeader } = useWordPressAuth()

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    
    // Limit to maxImages
    const limitedFiles = selectedFiles.slice(0, maxImages - files.length)
    
    if (limitedFiles.length === 0) {
      setError(`Máximo ${maxImages} imágenes/videos permitidos`)
      return
    }

    // Create previews - handle both images and videos
    const newPreviews = limitedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/')
    }))

    setFiles(prev => [...prev, ...limitedFiles])
    setPreviews(prev => [...prev, ...newPreviews])
    setError('')
  }

  const removeImage = (index) => {
    // Revoke object URL to prevent memory leak
    URL.revokeObjectURL(previews[index].preview)
    
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const uploadImages = async () => {
    if (files.length === 0) {
      setError('Selecciona al menos una imagen')
      return []
    }

    setIsUploading(true)
    setError('')
    const uploadedUrls = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        const isVideoFile = file.type.startsWith('video/')
        
        setUploadProgress(prev => ({
          ...prev,
          [i]: `Subiendo ${isVideoFile ? 'video' : 'imagen'} ${i + 1} de ${files.length}`
        }))
        const formData = new FormData()
        formData.append('file', file)
        formData.append('title', file.name)
        formData.append('caption', '')
        formData.append('alt_text', '')

        const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/media`, {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            // Don't set Content-Type - let browser set it with boundary
          },
          body: formData
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || `Error subiendo imagen ${i + 1}`)
        }

        const media = await response.json()
        uploadedUrls.push({
          id: media.id,
          url: media.source_url,
          thumbnail: media.media_details?.sizes?.thumbnail?.source_url || media.source_url,
          isVideo: isVideoFile
        })

        setUploadProgress(prev => ({
          ...prev,
          [i]: `Completado ${i + 1} de ${files.length}`
        }))
      }

      // Notify parent component
      if (onImagesUploaded) {
        onImagesUploaded(uploadedUrls)
      }

      // Clear files after successful upload
      setFiles([])
      setPreviews([])
      setUploadProgress({})

      return uploadedUrls
    } catch (err) {
      setError(`Error al subir imágenes: ${err.message}`)
      return []
    } finally {
      setIsUploading(false)
    }
  }

  const clearAll = () => {
    // Revoke all object URLs
    previews.forEach(preview => URL.revokeObjectURL(preview.preview))
    setFiles([])
    setPreviews([])
    setUploadProgress({})
    setError('')
  }

  // Clean up object URLs on unmount
  useState(() => {
    return () => {
      previews.forEach(preview => URL.revokeObjectURL(preview.preview))
    }
  })

  return (
    <div className="image-uploader">
      <div className="image-uploader__header">
        <h3>Medios ({files.length}/{maxImages})</h3>
        <p className="image-uploader__help">
          Sube 1-3 imágenes o videos. Se recomienda tamaño máximo 2MB por archivo.
        </p>
      </div>

      {previews.length > 0 && (
        <div className="image-uploader__previews">
          {previews.map((preview, index) => (
            <div key={index} className="image-uploader__preview-item">
              {preview.isVideo ? (
                <video 
                  src={preview.preview} 
                  className="image-uploader__preview-image"
                  muted
                />
              ) : (
                <img 
                  src={preview.preview} 
                  alt={`Previsualización ${index + 1}`}
                  className="image-uploader__preview-image"
                />
              )}
              <div className="image-uploader__preview-info">
                <span>{preview.file.name}</span>
                <span>
                  {(preview.file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <button
                type="button"
                className="image-uploader__remove-btn"
                onClick={() => removeImage(index)}
                disabled={isUploading}
                aria-label="Eliminar imagen"
              >
                ×
              </button>
              {uploadProgress[index] && (
                <div className="image-uploader__progress">
                  {uploadProgress[index]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length < maxImages && (
        <div className="image-uploader__upload-area">
          <label className="image-uploader__file-label">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileChange}
              disabled={isUploading}
              className="image-uploader__file-input"
            />
            <span className="image-uploader__file-button">
              Seleccionar imágenes o videos
            </span>
            <span className="image-uploader__file-hint">
              Arrastra o haz clic para seleccionar
            </span>
          </label>
        </div>
      )}

      {error && (
        <div className="image-uploader__error" role="alert">
          {error}
        </div>
      )}

      <div className="image-uploader__actions">
        <button
          type="button"
          className="image-uploader__upload-btn"
          onClick={uploadImages}
          disabled={isUploading || files.length === 0}
        >
          {isUploading ? 'Subiendo...' : 'Subir imágenes a WordPress'}
        </button>
        
        <button
          type="button"
          className="image-uploader__clear-btn"
          onClick={clearAll}
          disabled={isUploading || files.length === 0}
        >
          Limpiar todo
        </button>
      </div>
    </div>
  )
}

import React, { useState, useCallback, useRef } from 'react';
import heic2any from 'heic2any';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { UploadCloud, FileImage, CheckCircle, XCircle, Loader2, Download } from 'lucide-react';

const MAX_LONG_SIDE = 3000;
const MAX_SIZE_MB = 2.5;

function App() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const processImage = async (fileItem) => {
    try {
      let fileToProcess = fileItem.originalFile;
      
      // 1. Convert HEIC to PNG/JPEG blob first if needed
      if (fileToProcess.name.toLowerCase().endsWith('.heic') || fileToProcess.name.toLowerCase().endsWith('.heif') || fileToProcess.type === 'image/heic') {
        const convertedBlob = await heic2any({
          blob: fileToProcess,
          toType: 'image/jpeg',
          quality: 0.9
        });
        // heic2any might return an array of blobs if it's an image sequence, we take the first
        fileToProcess = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      }

      // 2. Load into an Image object
      const img = new Image();
      const objectUrl = URL.createObjectURL(fileToProcess);
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });

      // 3. Calculate new dimensions
      let { width, height } = img;
      const longSide = Math.max(width, height);
      
      if (longSide > MAX_LONG_SIDE) {
        const ratio = MAX_LONG_SIDE / longSide;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // 4. Draw to Canvas (This automatically strips EXIF and ICC profiles!)
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Fill white background (in case of transparency)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Clean up memory
      URL.revokeObjectURL(objectUrl);

      // 5. Compress to JPG
      const getBlob = (quality) => {
        return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
        });
      };

      let quality = 0.92;
      let finalBlob = await getBlob(quality);
      
      // If it's too big, reduce quality
      const maxBytes = MAX_SIZE_MB * 1024 * 1024;
      while (finalBlob.size > maxBytes && quality > 0.6) {
        quality -= 0.05;
        finalBlob = await getBlob(quality);
      }

      // If still too big, scale down further
      if (finalBlob.size > maxBytes) {
        canvas.width = Math.round(width * 0.8);
        canvas.height = Math.round(height * 0.8);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        finalBlob = await getBlob(0.7);
      }

      return finalBlob;

    } catch (error) {
      console.error("Error processing file", error);
      throw error;
    }
  };

  const handleFiles = (newFiles) => {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.bmp', '.webp'];
    
    const imageFiles = Array.from(newFiles).filter(file => {
      const name = file.name.toLowerCase();
      return validExtensions.some(ext => name.endsWith(ext));
    });

    if (imageFiles.length === 0) return;

    const fileItems = imageFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      originalFile: file,
      name: file.name,
      status: 'pending', // pending, processing, success, error
      resultBlob: null
    }));

    setFiles(prev => [...prev, ...fileItems]);
  };

  const startConversion = async () => {
    setIsProcessing(true);
    
    // We update files one by one to show progress
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'success') continue;
      
      setFiles(prev => prev.map((f, index) => 
        index === i ? { ...f, status: 'processing' } : f
      ));

      try {
        const resultBlob = await processImage(files[i]);
        setFiles(prev => prev.map((f, index) => 
          index === i ? { ...f, status: 'success', resultBlob } : f
        ));
      } catch (err) {
        setFiles(prev => prev.map((f, index) => 
          index === i ? { ...f, status: 'error' } : f
        ));
      }
    }
    
    setIsProcessing(false);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    let count = 1;
    
    files.forEach(file => {
      if (file.status === 'success' && file.resultBlob) {
        zip.file(`${count}.jpg`, file.resultBlob);
        count++;
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'wanwu_converted_photos.zip');
  };

  // Drag and Drop handlers
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const onFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // reset input so the same files can be selected again if needed
    e.target.value = '';
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Photo Converter</h1>
        <p>Convert HEIC, clean EXIF, and resize for Wanwukeyin</p>
      </div>

      <div 
        className={`dropzone ${isDragging ? 'active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="dropzone-content">
          <UploadCloud size={48} className="dropzone-icon" />
          <div className="dropzone-text">Click or drag photos here</div>
          <div className="dropzone-subtext">Supports HEIC, JPG, PNG</div>
        </div>
        <input 
          type="file" 
          multiple 
          accept="image/*,.heic,.heif"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={onFileSelect}
        />
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map(file => (
            <div key={file.id} className="file-item">
              <div className="file-info">
                <div className="file-icon">
                  <FileImage size={24} />
                </div>
                <div className="file-details">
                  <span className="file-name">{file.name}</span>
                  <span className="file-status">
                    {file.originalFile.size ? (file.originalFile.size / (1024 * 1024)).toFixed(1) + ' MB' : ''}
                  </span>
                </div>
              </div>
              <div className={`status-badge ${file.status}`}>
                {file.status === 'pending' && <span>Ready</span>}
                {file.status === 'processing' && <><Loader2 size={18} className="spin" /> Processing</>}
                {file.status === 'success' && <><CheckCircle size={18} /> Done</>}
                {file.status === 'error' && <><XCircle size={18} /> Failed</>}
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="actions">
          <button 
            className="btn btn-primary" 
            onClick={startConversion}
            disabled={isProcessing || files.every(f => f.status === 'success')}
          >
            {isProcessing ? (
              <><Loader2 size={20} className="spin"/> Converting...</>
            ) : (
              'Start Conversion'
            )}
          </button>
          
          {files.some(f => f.status === 'success') && (
            <button 
              className="btn btn-primary" 
              style={{ background: '#10b981' }}
              onClick={downloadZip}
              disabled={isProcessing}
            >
              <Download size={20} /> Download ZIP
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;

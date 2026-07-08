import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploadProductImages } from '../../lib/commerceApi';
import { useToast } from '../ui/ToastProvider';

interface ImageGalleryUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
}

export function ImageGalleryUpload({ images, onChange }: ImageGalleryUploadProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const res = await uploadProductImages(Array.from(fileList));
      onChange([...images, ...res.urls]);
    } catch {
      toast.push('Could not upload one or more images.', 'info');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAt = (index: number) => onChange(images.filter((_, i) => i !== index));

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Images</label>
      <div className="flex flex-wrap gap-2.5">
        {images.map((src, i) => (
          <div key={src} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          <span className="text-[10px] font-medium">{uploading ? 'Uploading' : 'Add'}</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

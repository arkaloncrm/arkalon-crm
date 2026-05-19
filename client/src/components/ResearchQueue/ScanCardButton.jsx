import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import Button from '../UI/Button.jsx';
import { scanApi } from '../../api/scan.js';
import { useToast } from '../../context/ToastContext.jsx';

// Camera photos are 3-4 MB raw; downscale before sending so the request stays
// small and the vision model gets a sensibly-sized image. Always re-encoded as
// JPEG by the canvas, so the upload media type is fixed.
const MAX_DIM = 1600;
const MIN_OVERLAY_MS = 1000;

function readAsResizedBase64(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl.split(',')[1]); // strip the "data:image/jpeg;base64," prefix
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

// Shape the vision-API output into the Research Queue form's field names. The
// card's job title has no dedicated form field, so it is kept in review_notes;
// the record title defaults to the person's name for a sensible list headline.
function toPrefill(card) {
  const fullName = [card.first_name, card.last_name].filter(Boolean).join(' ').trim();
  return {
    title: fullName || card.company_name || '',
    company_name: card.company_name || '',
    first_name: card.first_name || '',
    last_name: card.last_name || '',
    email: card.email || '',
    phone: card.phone || '',
    mobile: card.mobile || '',
    website: card.website || '',
    linkedin_url: card.linkedin_url || '',
    review_notes: card.title ? `Job title: ${card.title}` : '',
  };
}

const QUEUE_DEFAULTS = {
  candidate_type: 'Contact Candidate',
  source: 'Business Card Scan',
  confidence_level: 'Medium',
};

export default function ScanCardButton() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const fileInputRef = useRef(null);
  const [processing, setProcessing] = useState(false);

  const handleCardCapture = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setProcessing(true);
    const startedAt = Date.now();
    try {
      const image = await readAsResizedBase64(file);
      const res = await scanApi.businessCard({ image, mediaType: 'image/jpeg' });
      const card = res.data?.data;
      if (!card || typeof card !== 'object') throw new Error('malformed response');

      // Keep the overlay up for a moment so it doesn't flash.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_OVERLAY_MS) {
        await new Promise(r => setTimeout(r, MIN_OVERLAY_MS - elapsed));
      }

      navigate('/research-queue/new', {
        state: { prefill: toPrefill(card), ...QUEUE_DEFAULTS },
      });
    } catch (err) {
      addToast('Could not read the card. Please try again or enter details manually.', 'error');
      navigate('/research-queue/new', { state: { ...QUEUE_DEFAULTS } });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCardCapture}
        className="hidden"
        ref={fileInputRef}
      />
      <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
        <ScanLine className="w-4 h-4" /> Scan Card
      </Button>

      {processing && (
        <div className="fixed inset-0 z-[9998] bg-arkalon-navy/70 flex items-center justify-center">
          <div className="bg-white rounded-lg px-8 py-6 flex flex-col items-center gap-3 shadow-lg">
            <div className="w-8 h-8 border-4 border-arkalon-blue/30 border-t-arkalon-blue rounded-full animate-spin" />
            <span className="font-montserrat font-semibold text-arkalon-navy text-sm">Reading card…</span>
          </div>
        </div>
      )}
    </>
  );
}

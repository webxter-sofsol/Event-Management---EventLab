import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import axiosInstance from '../api/axiosInstance';
import type React from 'react';

type ScanStatus = 'idle' | 'scanning' | 'uploading' | 'success' | 'already_used' | 'invalid' | 'error';

interface CheckInResult {
  valid: boolean;
  already_checked_in?: boolean;
  detail: string;
  guest_name?: string;
  guest_email?: string;
  event_name?: string;
  ticket_type?: string;
  checked_in_at?: string;
}

export default function CheckInPage() {
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerDivId = 'qr-reader';

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    setScanStatus('scanning');
    try {
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          stopCamera();
          processToken(decodedText);
        },
        () => {} // ignore scan errors
      );
      setCameraActive(true);
    } catch (err) {
      setCameraError('Camera access denied or not available. Use manual entry below.');
      setScanStatus('idle');
    }
  }

  async function stopCamera() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setCameraActive(false);
  }

  async function processToken(token: string) {
    setScanStatus('idle');
    setResult(null);
    try {
      const res = await axiosInstance.post('/api/checkin/', { token });
      setResult(res.data);
      setScanStatus('success');
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: CheckInResult } };
      const data = e?.response?.data;
      if (e?.response?.status === 409 && data?.already_checked_in) {
        setResult(data);
        setScanStatus('already_used');
      } else if (e?.response?.status === 400 || e?.response?.status === 404) {
        setResult(data || null);
        setScanStatus('invalid');
      } else {
        setScanStatus('error');
      }
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualToken.trim()) {
      processToken(manualToken.trim());
      setManualToken('');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setScanStatus('uploading');
    setResult(null);

    try {
      const html5QrCode = new Html5Qrcode('qr-file-reader');
      const decodedText = await html5QrCode.scanFile(file, false);
      await processToken(decodedText);
    } catch (err) {
      setUploadError('Could not read QR code from image. Please try another image or use camera scan.');
      setScanStatus('idle');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function reset() {
    setScanStatus('idle');
    setResult(null);
    setCameraError(null);
    setUploadError(null);
  }

  const statusConfig: Record<ScanStatus, { bg: string; border: string; icon: string; label: string }> = {
    idle:        { bg: '#f8fafc',  border: '#e2e8f0', icon: '📷', label: 'Ready to scan' },
    scanning:    { bg: '#eff6ff',  border: '#bfdbfe', icon: '🔍', label: 'Scanning…' },
    uploading:   { bg: '#eff6ff',  border: '#bfdbfe', icon: '📤', label: 'Processing image…' },
    success:     { bg: '#f0fdf4',  border: '#86efac', icon: '✅', label: 'Check-in successful!' },
    already_used:{ bg: '#fef3c7',  border: '#fcd34d', icon: '⚠️', label: 'Already checked in' },
    invalid:     { bg: '#fef2f2',  border: '#fca5a5', icon: '❌', label: 'Invalid ticket' },
    error:       { bg: '#fef2f2',  border: '#fca5a5', icon: '❌', label: 'Error — try again' },
  };

  const cfg = statusConfig[scanStatus];

  return (
    <div className="page" style={{ maxWidth: '600px' }}>
      <div style={s.header}>
        <h1 style={s.title}>🎟 Event Check-In</h1>
        <p style={s.subtitle}>Scan a guest's QR code to check them in</p>
      </div>

      {/* Status card */}
      <div style={{ ...s.statusCard, background: cfg.bg, border: `2px solid ${cfg.border}` }}>
        <span style={s.statusIcon}>{cfg.icon}</span>
        <span style={s.statusLabel}>{cfg.label}</span>
      </div>

      {/* Result */}
      {result && (scanStatus === 'success' || scanStatus === 'already_used') && (
        <div style={{ ...s.resultCard, borderColor: scanStatus === 'success' ? '#86efac' : '#fcd34d' }}>
          <div style={s.resultRow}>
            <span style={s.resultLabel}>Guest</span>
            <span style={s.resultValue}>{result.guest_name}</span>
          </div>
          <div style={s.resultRow}>
            <span style={s.resultLabel}>Email</span>
            <span style={s.resultValue}>{result.guest_email}</span>
          </div>
          <div style={s.resultRow}>
            <span style={s.resultLabel}>Event</span>
            <span style={s.resultValue}>{result.event_name}</span>
          </div>
          <div style={s.resultRow}>
            <span style={s.resultLabel}>Ticket Type</span>
            <span style={{ ...s.resultValue, textTransform: 'capitalize' }}>{result.ticket_type}</span>
          </div>
          {result.checked_in_at && (
            <div style={s.resultRow}>
              <span style={s.resultLabel}>
                {scanStatus === 'already_used' ? 'Previously checked in' : 'Checked in at'}
              </span>
              <span style={s.resultValue}>{new Date(result.checked_in_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {(scanStatus === 'invalid' || scanStatus === 'error') && (
        <div className="alert alert-error">
          {result?.detail || 'Invalid or unrecognised QR code.'}
        </div>
      )}

      {/* QR Code Upload */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Upload QR Code Image</h2>
        <p style={s.sectionDesc}>Upload a screenshot or photo of the QR code.</p>
        <div id="qr-file-reader" style={{ display: 'none' }} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          id="qr-upload-input"
        />
        <label htmlFor="qr-upload-input" className="btn btn-primary" style={{ width: '100%', cursor: 'pointer', textAlign: 'center' }}>
          📤 Choose QR Code Image
        </label>
        {uploadError && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{uploadError}</div>}
      </div>

      {/* Camera scanner */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Camera Scan</h2>
        <div id={scannerDivId} style={{ width: '100%', borderRadius: '10px', overflow: 'hidden', minHeight: cameraActive ? '300px' : '0' }} />
        {cameraError && <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>{cameraError}</div>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          {!cameraActive ? (
            <button onClick={startCamera} className="btn btn-primary" style={{ flex: 1 }}>
              📷 Start Camera
            </button>
          ) : (
            <button onClick={stopCamera} className="btn btn-ghost" style={{ flex: 1 }}>
              ⏹ Stop Camera
            </button>
          )}
          {(scanStatus !== 'idle' && scanStatus !== 'scanning' && scanStatus !== 'uploading') && (
            <button onClick={reset} className="btn btn-secondary">
              Scan Another
            </button>
          )}
        </div>
      </div>

      {/* Manual token entry */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Manual Entry</h2>
        <p style={s.sectionDesc}>Paste the ticket token if camera is unavailable.</p>
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Paste ticket token here…"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8125rem' }}
          />
          <button type="submit" className="btn btn-primary" disabled={!manualToken.trim()}>
            Verify
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { marginBottom: '1.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' },
  subtitle: { margin: 0, fontSize: '0.875rem', color: '#64748b' },
  statusCard: { borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', transition: 'all 300ms ease' },
  statusIcon: { fontSize: '1.5rem' },
  statusLabel: { fontSize: '1rem', fontWeight: 700, color: '#0f172a' },
  resultCard: { background: '#fff', border: '2px solid', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  resultRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' },
  resultLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  resultValue: { fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', textAlign: 'right' },
  section: { background: '#fff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)' },
  sectionTitle: { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' },
  sectionDesc: { margin: '0 0 0.75rem', fontSize: '0.8125rem', color: '#64748b' },
};

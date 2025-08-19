"use client";

import { useState, useEffect, useRef } from "react";
import type React from "react";
import { PaperAirplaneIcon, ArrowPathIcon, PaperClipIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import Tooltip from "../ui/Tooltip";
import { useAuth } from "../../stores/useAuthStore";
import { useModelSelection, isEnhancedModels } from "../../stores";
import AttachmentTile, { type AttachmentData } from "./AttachmentTile";
import toast from "react-hot-toast";

interface MessageInputProps {
  onSendMessage: (message: string, options?: { attachmentIds?: string[]; draftId?: string }) => void
  disabled?: boolean;
  initialMessage?: string;
}

export default function MessageInput({ onSendMessage, disabled = false, initialMessage }: Readonly<MessageInputProps>) {
  const [message, setMessage] = useState("");
  const [showCount, setShowCount] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const composingRef = useRef(false);
  const hideCountTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isAuthenticated } = useAuth();
  const { availableModels, selectedModel, isEnhanced } = useModelSelection();
  const [draftId, setDraftId] = useState<string | null>(null);
  type LocalAttachment = {
    tempId: string; // local id for UI
    id?: string; // set when ready
    mime: string;
    size: number;
    originalName?: string;
    previewUrl: string; // Object URL
    file?: File; // kept for retry
    status: 'uploading' | 'failed' | 'ready';
  };
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const ATTACHMENT_CAP = 3;

  // Update message when initialMessage prop changes
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
      // Focus and select the textarea
      const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
    }
  }, [initialMessage]);

  // Detect mobile/touch devices to adjust Enter behavior
  useEffect(() => {
    const checkIsMobile = () => {
      if (typeof window === "undefined") return false;
      // Heuristics: coarse pointer OR small viewport width
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      const smallViewport = window.innerWidth <= 768; // tailwind md breakpoint
      return coarse || smallViewport;
    };

    const update = () => setIsMobile(checkIsMobile());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const genDraftId = () => {
    try {
      if (typeof crypto !== 'undefined' && typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID === 'function') {
        return (crypto as Crypto & { randomUUID?: () => string }).randomUUID!();
      }
    } catch {}
    return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  };

  // Create a fresh draftId when composer becomes active
  useEffect(() => {
    if (!draftId) {
      setDraftId(genDraftId());
    }
  }, [draftId]);

  const modelSupportsImages = (() => {
    if (!selectedModel) return false;
    // In enhanced mode we have rich model info in availableModels
    if (isEnhanced && isEnhancedModels(availableModels)) {
      const info = availableModels.find((m) => m.id === selectedModel);
      const mods = info?.input_modalities;
      return Array.isArray(mods) ? mods.includes('image') : false;
    }
    // Basic mode: conservatively disable (server will validate anyway)
    return false;
  })();

  const handleSend = () => {
    if (message.trim() && !disabled) {
      if (attachments.length > 0) {
        const ready = attachments.filter(a => a.status === 'ready' && a.id);
        onSendMessage(message.trim(), { attachmentIds: ready.map(a => a.id!) as string[], draftId: draftId || undefined });
      } else {
        onSendMessage(message.trim());
      }
      setMessage("");
      // Reset draft and clear pending attachments
      setAttachments((prev) => {
        // Revoke object URLs
        prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
        return [];
      });
      // Generate a new draftId for the next compose
  setDraftId(genDraftId());
      // Reset textarea height responsively and focus/select
      setTimeout(() => {
        const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = textarea.scrollHeight + "px";
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile, Enter should insert newline (do not send). Users tap the Send button to submit.
    // On desktop, Enter sends (unless Shift is held for newline).
    if (e.key === "Enter" && !e.shiftKey) {
      // If IME composition is active, don't treat Enter as submit
      // (covers languages like Chinese/Japanese/Korean).
  if (e.nativeEvent.isComposing || composingRef.current) {
        return;
      }
      if (isMobile) {
        // Allow default newline behavior on mobile
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const canAttach = isAuthenticated && modelSupportsImages && !disabled;

  const handlePickFiles = () => {
    if (!canAttach) return;
    fileInputRef.current?.click();
  };

  const validateClientFile = (file: File): string | null => {
    const allowed = new Set(['image/png','image/jpeg','image/webp']);
    if (!allowed.has(file.type)) return 'Unsupported file type';
    // Note: size limits are enforced server-side; optionally mirror here for UX
    const maxBytes = 10 * 1024 * 1024; // optimistic max; server enforces tier
    if (file.size > maxBytes) return 'File too large';
    return null;
  };

  const genTempId = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const createPendingTile = (file: File): string => {
    const tempId = genTempId();
    const previewUrl = URL.createObjectURL(file);
    setAttachments(prev => {
      const next: LocalAttachment[] = [...prev, {
        tempId,
        mime: file.type,
        size: file.size,
        originalName: file.name,
        previewUrl,
        file,
        status: 'uploading',
      }];
      return next.slice(0, ATTACHMENT_CAP);
    });
    return tempId;
  };

  const performUpload = async (tempId: string, file: File) => {
    if (!draftId) return;
    const validation = validateClientFile(file);
    if (validation) {
      toast.error(validation === 'Unsupported file type' ? 'Only PNG, JPG, or WebP images are allowed.' : 'Image is too large.');
      // mark failed
      setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, status: 'failed' } : a));
      return;
    }
    const form = new FormData();
    form.set('image', file);
    form.set('draftId', draftId);
    try {
      setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, status: 'uploading' } : a));
      const res = await fetch('/api/uploads/images', { method: 'POST', body: form });
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const msg = retryAfter ? `Rate limit hit. Try again in ${retryAfter}s.` : 'Rate limit hit. Try again in a moment.';
          toast.error(msg);
        } else {
          // Try to read server message
          try {
            const data = await res.json();
            const msg = data?.error || 'Upload failed.';
            toast.error(String(msg));
          } catch {
            toast.error('Upload failed.');
          }
        }
        setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, status: 'failed' } : a));
        return;
      }
  const data = await res.json();
      setAttachments(prev => prev.map(a => a.tempId === tempId ? ({
        ...a,
        id: data.id as string,
        mime: data.mime,
        size: data.size,
        originalName: data.originalName ?? a.originalName,
        status: 'ready',
      }) : a));
  } catch {
      toast.error('Network error during upload.');
      setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, status: 'failed' } : a));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = ATTACHMENT_CAP - attachments.length;
    const toUpload = files.slice(0, Math.max(0, remaining));
    for (const f of toUpload) {
      const validation = validateClientFile(f);
      if (validation) {
        toast.error(validation === 'Unsupported file type' ? 'Only PNG, JPG, or WebP images are allowed.' : 'Image is too large.');
        continue;
      }
      const tempId = createPendingTile(f);
      await performUpload(tempId, f);
    }
    // Clear value to allow re-selecting the same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canAttach) return; // show tooltip via disabled UI instead
    const items = Array.from(e.clipboardData.items || []);
    const images = items
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (images.length === 0) return;
    e.preventDefault();
    const remaining = ATTACHMENT_CAP - attachments.length;
    const toUpload = images.slice(0, Math.max(0, remaining));
    for (const f of toUpload) {
      const validation = validateClientFile(f);
      if (validation) {
        toast.error(validation === 'Unsupported file type' ? 'Only PNG, JPG, or WebP images are allowed.' : 'Image is too large.');
        continue;
      }
      const tempId = createPendingTile(f);
      await performUpload(tempId, f);
    }
  };

  const removeAttachment = async (tempIdOrId: string) => {
    // Find by tempId first; if not found, try by id
  const target = attachments.find(a => a.tempId === tempIdOrId) || attachments.find(a => a.id === tempIdOrId);
    const id = target?.id;
    if (id && target?.status === 'ready') {
      try { await fetch(`/api/attachments/${id}`, { method: 'DELETE' }); } catch {}
    }
    setAttachments((prev) => {
      const att = target;
      if (att) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a !== target);
    });
  };

  const retryAttachment = async (tempId: string) => {
    const tile = attachments.find(a => a.tempId === tempId);
    if (!tile || !tile.file) return;
    await performUpload(tempId, tile.file);
  };

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Composer Dock (pill) */}
      <div className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-2 sm:px-3 sm:py-3 flex flex-col gap-2">
        {/* Row 1: Textarea */}
        <div className="relative flex-1 min-w-0">
          <textarea
            id="message-input"
            name="message"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              // Show counter while typing and schedule hide
              setShowCount(true);
              if (hideCountTimerRef.current) window.clearTimeout(hideCountTimerRef.current);
              hideCountTimerRef.current = window.setTimeout(() => setShowCount(false), 1200);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => (composingRef.current = true)}
            onCompositionEnd={() => (composingRef.current = false)}
            placeholder="Type your message..."
            disabled={disabled}
            className="w-full px-3 py-2 bg-transparent border-0 outline-none resize-none focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-300 disabled:cursor-not-allowed"
            rows={1}
            style={{
              minHeight: "48px",
              maxHeight: "120px",
            }}
            enterKeyHint="send"
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "48px";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
        </div>

        {/* Row 2: Attachment previews (inside pill) */}
        {attachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto sm:overflow-x-visible snap-x snap-mandatory -mx-1 px-1">
            {attachments.map((att, idx) => (
              <AttachmentTile
                key={att.tempId || att.id || idx}
                data={att as unknown as AttachmentData}
                index={idx}
                onRemove={(id) => removeAttachment(id)}
                onRetry={(tid) => retryAttachment(tid)}
                className="w-16 h-16 sm:w-20 sm:h-20"
              />
            ))}
          </div>
        )}

  {/* Row 3: Controls (left features, right send) */}
  <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1">
      <Tooltip content="Web Search (coming soon)" side="top" align="start" tinted>
              <button
                type="button"
                aria-label="Web Search (coming soon)"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-600/60 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled
              >
        <GlobeAltIcon className="w-5 h-5" />
              </button>
            </Tooltip>

            <Tooltip
              content={
                !isAuthenticated
                  ? 'Please sign in to use this feature'
                  : !modelSupportsImages
                  ? 'Selected model doesn’t support image input'
                  : attachments.length >= ATTACHMENT_CAP
                  ? 'Maximum 3 images per message'
                  : 'Attach image (png, jpg, webp)'
              }
              side="top"
              align="start"
              tinted
            >
              <button
                type="button"
                onClick={handlePickFiles}
                disabled={!canAttach || attachments.length >= ATTACHMENT_CAP}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-600/60 disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="Attach image"
              >
                <PaperClipIcon className="w-5 h-5" />
              </button>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={handleFileChange}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
            aria-label="Send message"
          >
            {disabled ? (
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
          </button>

          {/* Floating character counter centered in controls row (no layout shift) */}
          <div
            aria-live="polite"
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-2 z-10 text-[11px] rounded-md px-2 py-1 transition-opacity duration-300 select-none border 
              ${showCount ? 'opacity-100' : 'opacity-0'} 
              bg-gray-100/80 text-gray-700 border-gray-300 
              dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-600`}
          >
            {`${message.length} characters`}
          </div>
        </div>

      </div>
    </div>
  );
}

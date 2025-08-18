"use client";

import { useState, useEffect, useRef } from "react";
import type React from "react";
import { PaperAirplaneIcon, ArrowPathIcon, PaperClipIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Tooltip from "../ui/Tooltip";
import { useAuth } from "../../stores/useAuthStore";
import { useModelSelection, isEnhancedModels } from "../../stores";
import { sanitizeAttachmentName, fallbackImageLabel } from "../../lib/utils/sanitizeAttachmentName";

interface MessageInputProps {
  onSendMessage: (message: string, options?: { attachmentIds?: string[]; draftId?: string }) => void
  disabled?: boolean;
  initialMessage?: string;
}

export default function MessageInput({ onSendMessage, disabled = false, initialMessage }: Readonly<MessageInputProps>) {
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const composingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isAuthenticated } = useAuth();
  const { availableModels, selectedModel, isEnhanced } = useModelSelection();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{
    id: string;
    mime: string;
    size: number;
    originalName?: string;
    previewUrl: string; // Object URL
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
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
        onSendMessage(message.trim(), { attachmentIds: attachments.map(a => a.id), draftId: draftId || undefined });
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

  const uploadOne = async (file: File) => {
    if (!draftId) return;
    const err = validateClientFile(file);
    if (err) {
      // simple alert; could integrate toast
      console.warn('Upload rejected:', err);
      return;
    }
    const form = new FormData();
    form.set('image', file);
    form.set('draftId', draftId);
    // sessionId is our current conversation id; omit here as store id differs from server session id in this app
    try {
      setIsUploading(true);
      const res = await fetch('/api/uploads/images', { method: 'POST', body: form });
      if (!res.ok) {
        console.warn('Upload failed', await res.text());
        return;
      }
      const data = await res.json();
      const previewUrl = URL.createObjectURL(file);
      setAttachments((prev) => {
        const next = [...prev, { id: data.id as string, mime: data.mime, size: data.size, originalName: data.originalName, previewUrl }];
        return next.slice(0, ATTACHMENT_CAP);
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = ATTACHMENT_CAP - attachments.length;
    const toUpload = files.slice(0, Math.max(0, remaining));
    for (const f of toUpload) {
      await uploadOne(f);
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
      await uploadOne(f);
    }
  };

  const removeAttachment = async (id: string) => {
    try {
      await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    } catch {}
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className="flex items-start space-x-4">
        {/* Attach Button */}
        <div className="flex-shrink-0 pt-1">
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
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
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
        <div className="flex-1">
          <textarea
            id="message-input"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => (composingRef.current = true)}
            onCompositionEnd={() => (composingRef.current = false)}
            placeholder="Type your message..."
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
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

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((att, idx) => {
                const label = sanitizeAttachmentName(att.originalName) || fallbackImageLabel(idx);
                return (
                  <div key={att.id} className="relative group border border-gray-200 dark:border-gray-600 rounded-md overflow-hidden w-20 h-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={att.previewUrl} alt={label} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {isUploading && (
                <div className="w-20 h-20 border border-dashed border-gray-300 dark:border-gray-600 rounded-md flex items-center justify-center text-xs text-gray-500">
                  Uploading…
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="flex-shrink-0 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 h-12"
          aria-label="Send message"
        >
          {disabled ? (
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : (
            <PaperAirplaneIcon className="w-5 h-5" />
          )}
        </button>
      </div>
      
      {/* Character count and hint */}
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {message.length > 0 && `${message.length} characters`}
        </span>
        <span className="hidden sm:inline">
          {isMobile
            ? "Tap Send to send • Return for new line"
            : "Press Enter to send • Shift+Enter for new line"}
        </span>
      </div>
    </div>
  );
}

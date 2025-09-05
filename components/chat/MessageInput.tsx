"use client";

import { useState, useEffect, useRef } from "react";
import type React from "react";
import { PaperAirplaneIcon, ArrowPathIcon, PaperClipIcon, GlobeAltIcon, XMarkIcon, LightBulbIcon, PlayIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import Tooltip from "../ui/Tooltip";
import { useAuth } from "../../stores/useAuthStore";
import { useModelSelection } from "../../stores";
import { useSettingsStore } from "../../stores/useSettingsStore";
import AttachmentTile, { type AttachmentData } from "./AttachmentTile";
import toast from "react-hot-toast";
import { useUserData } from "../../hooks/useUserData";
import type { ModelInfo } from "../../lib/types/openrouter";
import { MAX_MESSAGE_CHARS } from "../../lib/config/limits";

interface MessageInputProps {
  onSendMessage: (message: string, options?: { attachmentIds?: string[]; draftId?: string; webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' } }) => void
  disabled?: boolean;
  // NEW: show spinner based on sending state while keeping button disabled
  isSending?: boolean;
  initialMessage?: string;
  // Optional: allow parent to open the model selector with a preset filter (e.g., 'multimodal')
  onOpenModelSelector?: (presetFilter?: 'all' | 'free' | 'paid' | 'multimodal' | 'reasoning') => void;
}

export default function MessageInput({ onSendMessage, disabled = false, isSending = false, initialMessage, onOpenModelSelector }: Readonly<MessageInputProps>) {
  const [message, setMessage] = useState("");
  const [showCount, setShowCount] = useState(false);
  const [liveMsg, setLiveMsg] = useState<string>(""); // for aria-live threshold announcements
  const wasOverRef = useRef<boolean>(false);
  const [isMobile, setIsMobile] = useState(false);
  const [streamingOn, setStreamingOn] = useState(false); // UI-only toggle for streaming
  const [webSearchOn, setWebSearchOn] = useState(false); // UI-only toggle
  const [webMaxResults, setWebMaxResults] = useState<number>(3); // UI setting for web search results (1-5)
  const [reasoningOn, setReasoningOn] = useState(false); // UI-only toggle
  const [streamingModalOpen, setStreamingModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [reasoningModalOpen, setReasoningModalOpen] = useState(false);
  const [gatingOpen, setGatingOpen] = useState<
    | false
    | 'images'
    | 'search'
    | 'reasoning'
    | 'images-unsupported'
    | 'reasoning-unsupported'
    | 'images-cap'
    | 'images-signin'
  >(false);
  const composingRef = useRef(false);
  const hideCountTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gatingRef = useRef<HTMLDivElement | null>(null);
  const streamingModalRef = useRef<HTMLDivElement | null>(null);
  const searchModalRef = useRef<HTMLDivElement | null>(null);
  const reasoningModalRef = useRef<HTMLDivElement | null>(null);
  const { isAuthenticated } = useAuth();
  const { getSetting, setSetting } = useSettingsStore();
  const { availableModels, selectedModel } = useModelSelection();
  // Track previous model to detect actual changes (not reselecting the same)
  const prevSelectedModelRef = useRef<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const { data: userData } = useUserData({ enabled: !!isAuthenticated });
  const isTempBanned = !!userData?.profile?.banned_until && new Date(userData.profile.banned_until).getTime() > Date.now();
  const isBanned = Boolean(userData?.profile?.is_banned) || isTempBanned;
  const userTier = (userData?.profile.subscription_tier || 'free') as 'free' | 'pro' | 'enterprise';
  const isEnterprise = userTier === 'enterprise';
  type LocalAttachment = {
    tempId: string; // local id for UI
    id?: string; // set when ready
    mime: string;
    size: number;
    originalName?: string;
    previewUrl: string; // Object URL
    file?: File; // kept for retry
    status: 'uploading' | 'failed' | 'ready' | 'deleting';
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

  // Load streaming setting from store
  useEffect(() => {
    const streamingEnabled = Boolean(getSetting('streamingEnabled', false));
    setStreamingOn(streamingEnabled);
  const savedWebMax = Number(getSetting('webMaxResults', 3));
  if (Number.isFinite(savedWebMax)) setWebMaxResults(Math.max(1, Math.min(5, Math.trunc(savedWebMax))));
  }, [getSetting]);

  // Announce when crossing the character limit threshold
  useEffect(() => {
    const isOver = message.length > MAX_MESSAGE_CHARS;
    if (isOver !== wasOverRef.current) {
      wasOverRef.current = isOver;
      setLiveMsg(isOver ? 'Character limit exceeded. Sending is disabled.' : 'Back under character limit. You can send now.');
    }
  }, [message.length]);

  // Close streaming settings modal on outside click and Escape
  useEffect(() => {
    if (!streamingModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStreamingModalOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = streamingModalRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setStreamingModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, { capture: true } as EventListenerOptions);
    };
  }, [streamingModalOpen]);

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
    // Enhanced-only models: read from metadata
    const info = Array.isArray(availableModels)
      ? (availableModels as ModelInfo[]).find((m) => m && typeof m === 'object' && 'id' in m && m.id === selectedModel)
      : undefined;
    const mods = info?.input_modalities as string[] | undefined;
    return Array.isArray(mods) ? mods.includes('image') : false;
  })();

  const modelSupportsReasoning = (() => {
    if (!selectedModel) return false;
    const info = Array.isArray(availableModels)
      ? (availableModels as ModelInfo[]).find((m) => m && typeof m === 'object' && 'id' in m && m.id === selectedModel)
      : undefined;
    const params = info?.supported_parameters as string[] | undefined;
    return Array.isArray(params)
      ? (params.includes('reasoning') || params.includes('include_reasoning'))
      : false;
  })();

  // Resolve a human-friendly model display name
  const getModelDisplayName = (info: Partial<ModelInfo> | null | undefined, fallbackId?: string) => {
    const anyInfo = info as unknown as { name?: string; label?: string } | null | undefined;
    return (anyInfo?.name || anyInfo?.label || fallbackId || 'Selected model');
  };

  const handleSend = () => {
    const charCount = message.length;
    const isOver = charCount > MAX_MESSAGE_CHARS;
    if (isOver) {
      // Block send when over limit
      return;
    }
    if (message.trim() && !disabled) {
      if (attachments.length > 0) {
        const ready = attachments.filter(a => a.status === 'ready' && a.id);
        onSendMessage(message.trim(), { attachmentIds: ready.map(a => a.id!) as string[], draftId: draftId || undefined, webSearch: webSearchOn, webMaxResults: webSearchOn ? webMaxResults : undefined, reasoning: reasoningOn ? { effort: 'low' } : undefined });
      } else {
        onSendMessage(message.trim(), { webSearch: webSearchOn, webMaxResults: webSearchOn ? webMaxResults : undefined, reasoning: reasoningOn ? { effort: 'low' } : undefined });
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

  // Primary banner action: discard images and send text only
  const handleDiscardImagesAndSend = async () => {
    if (!message.trim() || disabled) return;
    // Best-effort cleanup of any uploaded attachments before sending
    const toDelete = attachments.filter(a => a.status === 'ready' && a.id).map(a => a.id!) as string[];
    // Fire-and-forget delete requests
    for (const id of toDelete) {
      try { fetch(`/api/attachments/${id}`, { method: 'DELETE' }); } catch {}
    }
  onSendMessage(message.trim(), { webSearch: webSearchOn, webMaxResults: webSearchOn ? webMaxResults : undefined });
    // Clear local state
    setMessage("");
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    setDraftId(genDraftId());
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
      // Block Enter-to-send when over the character limit
      if (message.length > MAX_MESSAGE_CHARS) {
        e.preventDefault();
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

  const tierBlocksImages = isAuthenticated && userTier === 'free';
  const tierBlocksSearch = isAuthenticated && userTier === 'free';
  // Reasoning: enterprise only
  const eligibleForReasoning = isAuthenticated && userTier === 'enterprise';

  // Close gating on outside click and Escape
  useEffect(() => {
    if (!gatingOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGatingOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = gatingRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setGatingOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, { capture: true } as EventListenerOptions);
    };
  }, [gatingOpen]);

  // Close search settings modal on outside click and Escape
  useEffect(() => {
    if (!searchModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchModalOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = searchModalRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setSearchModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, { capture: true } as EventListenerOptions);
    };
  }, [searchModalOpen]);

  // Close reasoning settings modal on outside click and Escape
  useEffect(() => {
    if (!reasoningModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReasoningModalOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = reasoningModalRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setReasoningModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, { capture: true } as EventListenerOptions);
    };
  }, [reasoningModalOpen]);

  // Reset Web Search and Reasoning toggles when user changes model selection
  useEffect(() => {
    const prev = prevSelectedModelRef.current;
    // Only reset when there was a previous selection and it actually changed
    if (prev !== null && selectedModel && selectedModel !== prev) {
      setWebSearchOn(false);
      setReasoningOn(false);
    }
    prevSelectedModelRef.current = selectedModel || null;
  }, [selectedModel]);

  const handlePickFiles = () => {
    // Disabled via prop: do nothing
    if (disabled) return;
    // If a model is selected but does not support images → anchored notice first (consistent with Free tier behavior)
    if (selectedModel && !modelSupportsImages) {
      setGatingOpen('images-unsupported');
      return;
    }
    // Not signed in → upgrade-oriented notice (only after capability check)
    if (!isAuthenticated) {
      // Show the same upgrade popover as Free tier
      setGatingOpen('images');
      return;
    }
    // Over capacity → anchored notice
    if (attachments.length >= ATTACHMENT_CAP) {
      setGatingOpen('images-cap');
      return;
    }
    // Tier gating for images
    if (tierBlocksImages) {
      setGatingOpen('images');
      return;
    }
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
    
    // If user picked more than remaining capacity, notify but continue with allowed subset
    if (files.length > remaining) {
      toast.error('You can attach up to 3 images.');
    }
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
    // If input is disabled, let browser handle paste (likely no-op)
    if (disabled) return;

    // 1) Detect whether the clipboard actually contains image files first.
    // We should only apply image-related gating when images are present.
    const items = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);

    // No images present → allow normal text paste without any gating.
    if (images.length === 0) return;

    // 2) Capability check first: if a model is selected but doesn't support images → toast for everyone.
    if (selectedModel && !modelSupportsImages) {
      toast.error(`This model does not support image input.`);
      e.preventDefault();
      return;
    }

    // 3) If not signed in and model supports images → show upgrade popover and block image paste.
    if (!isAuthenticated) {
      setGatingOpen('images');
      e.preventDefault();
      return;
    }

    // 4) Free tier → gate with upgrade popover.
    if (tierBlocksImages) {
      setGatingOpen('images');
      e.preventDefault();
      return;
    }

    // 5) Eligible tier and model supports images → intercept paste and upload images.
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
    if (!target) return;
    const previousStatus = target.status;
  // Optimistic: mark as deleting so the tile shows overlay and button disables
  setAttachments(prev => prev.map(a => ((a.tempId === target.tempId) || (target.id && a.id === target.id)) ? { ...a, status: 'deleting' } : a));
    const id = target.id;
    let ok = true;
    if (id && (previousStatus === 'ready' || previousStatus === 'deleting')) {
      try {
        const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
        ok = res.ok;
        if (!res.ok && res.status !== 204) {
          try {
            const data = await res.json();
            if (data?.error) toast.error(String(data.error));
          } catch {}
        }
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setAttachments((prev) => {
        const keyId = target.id;
        const keyTemp = target.tempId;
        const idx = prev.findIndex(a => (keyId ? a.id === keyId : a.tempId === keyTemp));
        const toRemove = idx >= 0 ? prev[idx] : undefined;
        if (toRemove) URL.revokeObjectURL(toRemove.previewUrl);
        return prev.filter(a => (keyId ? a.id !== keyId : a.tempId !== keyTemp));
      });
    } else {
      // Rollback: restore previous status and notify
      toast.error('Failed to delete image. Please try again.');
      setAttachments(prev => prev.map(a => ((a.tempId === target.tempId) || (target.id && a.id === target.id)) ? { ...a, status: previousStatus } : a));
    }
  };

  const retryAttachment = async (tempId: string) => {
    const tile = attachments.find(a => a.tempId === tempId);
    if (!tile || !tile.file) return;
    await performUpload(tempId, tile.file);
  };

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Composer Dock (pill) */}
      <div className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-2 sm:px-3 sm:py-3 flex flex-col gap-2 
        transition-colors duration-150 
        focus-within:border-transparent focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-inset">
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
            placeholder={isBanned ? "You can't send messages while banned" : "Type your message..."}
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

        {/* Inline over-limit hint */}
        {message.length > MAX_MESSAGE_CHARS && (
          <div
            data-testid="char-limit-hint"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            Reduce by {message.length - MAX_MESSAGE_CHARS} to send
          </div>
        )}

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

        {/* Row 2.5: Inline banner if images present but selected model is text-only */}
        {attachments.length > 0 && !modelSupportsImages && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 dark:border-emerald-700/60 dark:bg-emerald-900/40 px-3 py-2.5">
            <div className="flex flex-col gap-2.5">
              <div className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
                <div className="text-emerald-900 dark:text-emerald-100">
                  {(() => {
                    // Get the selected model's display name
                    const selectedModelData = Array.isArray(availableModels) && availableModels.length > 0 
                      ? (availableModels as ModelInfo[]).find((m) => m && typeof m === 'object' && 'id' in m && m.id === selectedModel)
                      : null;
                    const name = getModelDisplayName(selectedModelData ?? undefined, selectedModel ?? undefined);
                    return (
                      <>
                        <span className="font-semibold">{name}</span> doesn&apos;t support image input.
                      </>
                    );
                  })()}
                </div>
                <div className="mt-1">
                  You can discard the {attachments.length === 1 ? 'image' : 'images'} and send text only, or switch to a multimodal model.
                </div>
              </div>
        <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={handleDiscardImagesAndSend}
                  disabled={!message.trim() || disabled}
                  className="flex-1 sm:flex-none sm:w-32 h-9 flex items-center justify-center text-xs font-medium px-3 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:ring-offset-2 focus:ring-offset-emerald-50 dark:focus:ring-offset-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  Send without image{attachments.length === 1 ? '' : 's'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenModelSelector?.('multimodal')}
                  className="flex-1 sm:flex-none sm:w-32 h-9 flex items-center justify-center text-xs font-medium px-3 rounded-md border border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-200 bg-white dark:bg-transparent hover:bg-emerald-50 hover:border-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:border-emerald-400 dark:hover:text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:ring-offset-2 focus:ring-offset-emerald-50 dark:focus:ring-offset-emerald-900/20 transition-colors duration-150"
                >
                  Switch model
                </button>
              </div>
            </div>
          </div>
        )}

  {/* Row 3: Controls (left features, right send) */}
  <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={streamingOn ? 'Streaming: ON' : 'Streaming'}
              aria-pressed={streamingOn}
              title="Streaming"
              onClick={() => {
                if (disabled) return;
                // Open streaming settings modal
                setStreamingModalOpen(true);
              }}
              className={`relative inline-flex items-center justify-center w-10 h-10 rounded-lg border bg-transparent disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none 
                border-gray-300 dark:border-gray-600 
                ${streamingOn ? 'ring-0' : ''} 
                ${!disabled ? 'hover:bg-gray-100/50 dark:hover:bg-gray-600/40' : ''}`}
              disabled={disabled}
            >
              <PlayIcon
                className={`w-5 h-5 transition-all duration-150 
                  ${streamingOn
                    ? 'text-emerald-600 dark:text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                    : 'text-gray-700 dark:text-gray-200 opacity-80'}
                `}
              />
              {streamingOn && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-1 w-5 h-px rounded-full bg-emerald-600 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                />
              )}
            </button>
            <button
              type="button"
              aria-label={webSearchOn ? 'Web Search: ON' : 'Web Search'}
              aria-pressed={webSearchOn}
              title="Web Search"
              onClick={() => {
                if (disabled) return;
                // Free or anonymous → upgrade modal
                if (!isAuthenticated || tierBlocksSearch) {
                  setGatingOpen('search');
                  return;
                }
                // Eligible tiers → open settings modal
                setSearchModalOpen(true);
              }}
              className={`relative inline-flex items-center justify-center w-10 h-10 rounded-lg border bg-transparent disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none 
                border-gray-300 dark:border-gray-600 
                ${webSearchOn ? 'ring-0' : ''} 
                ${!disabled ? 'hover:bg-gray-100/50 dark:hover:bg-gray-600/40' : ''}`}
              disabled={disabled}
            >
              <GlobeAltIcon
                className={`w-5 h-5 transition-all duration-150 
                  ${webSearchOn
                    ? 'text-cyan-600 dark:text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.55)]'
                    : 'text-gray-700 dark:text-gray-200 opacity-80'}
                `}
              />
              {webSearchOn && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-1 w-5 h-px rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.6)]"
                />
              )}
            </button>
            <button
              type="button"
              aria-label={reasoningOn ? 'Reasoning: ON' : 'Reasoning'}
              aria-pressed={reasoningOn}
              title="Reasoning"
              onClick={() => {
                if (disabled) return;
                // Unsupported model → explain
                if (!modelSupportsReasoning) {
                  setGatingOpen('reasoning-unsupported');
                  return;
                }
                // Anonymous or non-enterprise → upgrade popover
                if (!eligibleForReasoning) {
                  setGatingOpen('reasoning');
                  return;
                }
                // Eligible enterprise → open settings popover
                setReasoningModalOpen(true);
              }}
              className={`relative inline-flex items-center justify-center w-10 h-10 rounded-lg border bg-transparent disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none 
                border-gray-300 dark:border-gray-600 
                ${reasoningOn ? 'ring-0' : ''} 
                ${!disabled ? 'hover:bg-gray-100/50 dark:hover:bg-gray-600/40' : ''}`}
              disabled={disabled}
            >
              <LightBulbIcon
                className={`w-5 h-5 transition-all duration-150 
                  ${reasoningOn
                    ? 'text-amber-600 dark:text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.55)]'
                    : 'text-gray-700 dark:text-gray-200 opacity-80'}
                `}
              />
              {reasoningOn && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-1 w-5 h-px rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                />
              )}
            </button>
            <button
              type="button"
              onClick={handlePickFiles}
              disabled={disabled}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-600/60 disabled:opacity-60 disabled:cursor-not-allowed"
              aria-label="Attach Image"
              title="Attach Image"
            >
              <PaperClipIcon className="w-5 h-5" />
            </button>
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
            disabled={!message.trim() || disabled || message.length > MAX_MESSAGE_CHARS}
            className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
            aria-label="Send message"
            data-testid="send-button"
          >
            {isSending ? (
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
          </button>

          {/* Floating character counter centered in controls row (no layout shift) */}
          <div
            aria-live="polite"
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 z-10 text-[11px] rounded-md px-2 py-1 transition-opacity duration-300 select-none border shadow-md backdrop-blur-sm shadow-black/10 dark:shadow-black/30
              ${showCount ? 'opacity-100' : 'opacity-0'} 
              ${message.length > MAX_MESSAGE_CHARS
                ? 'bg-red-700 text-white border-red-600 dark:bg-red-700 dark:text-white dark:border-red-600 sm:bg-red-100/90 sm:text-red-700 sm:border-red-300 sm:dark:bg-red-900/50 sm:dark:text-red-200 sm:dark:border-red-700'
                : 'bg-gray-900/80 text-white border-gray-800 dark:bg-gray-900/80 dark:text-white dark:border-gray-700 sm:bg-gray-100/80 sm:text-gray-700 sm:border-gray-300 sm:dark:bg-gray-800/70 sm:dark:text-gray-200 sm:dark:border-gray-600'}`}
            data-testid="char-counter"
          >
            {`${message.length} characters`}
          </div>

          {/* Screen-reader only live region for threshold crossings */}
          <div className="sr-only" aria-live="polite">{liveMsg}</div>

          {/* Gating popovers anchored above the left buttons. */}
          {gatingOpen && (
            <>
              {/* Web Search upgrade popover */}
              {gatingOpen === 'search' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-emerald-500 bg-emerald-50 ring-1 ring-inset ring-emerald-100 dark:border-emerald-400 dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="mb-1.5 pr-6 font-semibold text-emerald-900 dark:text-emerald-200">Upgrade to use Web Search</div>
                  <div className="mb-3 text-gray-800 dark:text-gray-200">Your current plan doesn’t include web search. Available on Pro and Enterprise.</div>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" className="px-2.5 py-1 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100" onClick={() => setGatingOpen(false)}>Maybe later</button>
                    <button type="button" className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setGatingOpen(false)}>Upgrade</button>
                  </div>
                </div>
              )}

              {/* Reasoning upgrade popover */}
              {gatingOpen === 'reasoning' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-emerald-500 bg-emerald-50 ring-1 ring-inset ring-emerald-100 dark:border-emerald-400 dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="mb-1.5 pr-6 font-semibold text-emerald-900 dark:text-emerald-200">Upgrade to enable Reasoning</div>
                  <div className="mb-3 text-gray-800 dark:text-gray-200">Reasoning is available for enterprise accounts only.</div>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" className="px-2.5 py-1 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100" onClick={() => setGatingOpen(false)}>Maybe later</button>
                    <button type="button" className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setGatingOpen(false)}>Upgrade</button>
                  </div>
                </div>
              )}

              {/* Images gating upgrade popover */}
              {gatingOpen === 'images' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-emerald-500 bg-emerald-50 ring-1 ring-inset ring-emerald-100 dark:border-emerald-400 dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="mb-1.5 pr-6 font-semibold text-emerald-900 dark:text-emerald-200">Upgrade to attach images</div>
                  <div className="mb-3 text-gray-800 dark:text-gray-200">Your current plan doesn’t include image uploads. Available on Pro and Enterprise.</div>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" className="px-2.5 py-1 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100" onClick={() => setGatingOpen(false)}>Maybe later</button>
                    <button type="button" className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setGatingOpen(false)}>Upgrade</button>
                  </div>
                </div>
              )}

              {/* Images: model unsupported notice */}
              {gatingOpen === 'images-unsupported' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="pr-6 text-gray-800 dark:text-gray-200">Selected model doesn’t support image input</div>
                </div>
              )}

              {/* Reasoning: model unsupported notice */}
              {gatingOpen === 'reasoning-unsupported' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="pr-6 text-gray-800 dark:text-gray-200">Selected model doesn’t support reasoning</div>
                </div>
              )}

              {/* Images: capacity reached notice */}
              {gatingOpen === 'images-cap' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="pr-6 text-gray-800 dark:text-gray-200">Maximum 3 images per message</div>
                </div>
              )}

              {/* Images: sign-in required notice */}
              {gatingOpen === 'images-signin' && (
                <div
                  ref={gatingRef}
                  data-testid="gating-popover"
                  className="absolute left-0 bottom-full mb-2 z-40 w-72 sm:w-80 rounded-lg border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-gray-900/95 p-3 text-sm dark:shadow-2xl"
                >
                  <button
                    aria-label="Close"
                    onClick={() => setGatingOpen(false)}
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  <div className="mb-1.5 pr-6 font-semibold text-slate-900 dark:text-gray-100">Upgrade to attach images</div>
                  <div className="pr-6 text-gray-800 dark:text-gray-200">Available on Pro and Enterprise. Sign in to upgrade.</div>
                </div>
              )}
            </>
          )}

          {/* Streaming settings popover anchored above buttons */}
          {streamingModalOpen && (
            <div
              ref={streamingModalRef}
              className="absolute left-0 bottom-full mb-2 z-40 w-80 rounded-lg border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-gray-800 p-4 dark:shadow-2xl"
            >
              <button
                aria-label="Close"
                onClick={() => setStreamingModalOpen(false)}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
              <div className="mb-2 pr-6 text-sm font-semibold text-slate-900 dark:text-gray-100">Enable streaming</div>
              <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">Stream responses in real-time for faster interaction.</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-800 dark:text-gray-200">Streaming</span>
                <button
                  type="button"
                  data-testid="streaming-toggle"
                  aria-pressed={streamingOn}
                  onClick={() => {
                    const newValue = !streamingOn;
                    setStreamingOn(newValue);
                    setSetting('streamingEnabled', newValue);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${streamingOn ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${streamingOn ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Web Search settings popover (pro/enterprise) anchored above buttons */}
          {searchModalOpen && (
            <div
              ref={searchModalRef}
              className="absolute left-0 bottom-full mb-2 z-40 w-80 rounded-lg border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-gray-800 p-4 dark:shadow-2xl"
            >
              <button
                aria-label="Close"
                onClick={() => setSearchModalOpen(false)}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
              <div className="mb-2 pr-6 text-sm font-semibold text-slate-900 dark:text-gray-100">Enable web search</div>
              <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">Allow the assistant to perform web lookups for fresher results.</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-800 dark:text-gray-200">Web Search</span>
                <button
                  type="button"
                  data-testid="websearch-toggle"
                  aria-pressed={webSearchOn}
                  onClick={() => setWebSearchOn(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${webSearchOn ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${webSearchOn ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </div>
              {/* Max results slider (disabled when Web Search is off or when not Enterprise) */}
              <div className="mt-4">
                <label
                  className={`flex items-center justify-between gap-2 text-sm mb-2 ${webSearchOn && isEnterprise ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}
                  aria-disabled={!webSearchOn || !isEnterprise}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span>Max results</span>
                    {/* Info tooltip explaining Enterprise-only configuration */}
                    <Tooltip
                      widthClassName="w-80"
                      content={(
                        <div className="text-sm">
                          <div className="font-medium mb-1">Max results</div>
                          <div className="text-gray-800 dark:text-gray-200">
                            Controls how many web pages are fetched and cited per request.
                            <br />
                            <span className="font-medium">Enterprise</span> accounts can set 1–5. <span className="font-medium">Pro</span> uses the default of 3.
                          </div>
                        </div>
                      )}
                      ariaLabel="What is Max results?"
                    >
                      <InformationCircleIcon className="w-4 h-4 opacity-70" />
                    </Tooltip>
                  </span>
                  <span className="font-medium">{isEnterprise ? webMaxResults : 3}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={isEnterprise ? webMaxResults : 3}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(5, Math.trunc(Number(e.target.value) || 3)));
                    setWebMaxResults(v);
                    setSetting('webMaxResults', v);
                  }}
                  disabled={!webSearchOn || !isEnterprise}
                  className={`w-full accent-emerald-600 ${(!webSearchOn || !isEnterprise) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Web search max results"
                  data-testid="websearch-max-results"
                />
              </div>
            </div>
          )}

          {/* Reasoning settings popover (enterprise) anchored above buttons */}
          {reasoningModalOpen && (
            <div
              ref={reasoningModalRef}
              className="absolute left-0 bottom-full mb-2 z-40 w-80 rounded-lg border-2 border-slate-500 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 dark:shadow-2xl"
            >
              <button
                aria-label="Close"
                onClick={() => setReasoningModalOpen(false)}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
              <div className="mb-2 pr-6 text-sm font-semibold text-slate-900 dark:text-gray-100">Enable reasoning</div>
              <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">Enables model thinking steps; increases output tokens and latency. Default is low effort.</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-800 dark:text-gray-200">Reasoning</span>
                <button
                  type="button"
                  data-testid="reasoning-toggle"
                  aria-pressed={reasoningOn}
                  onClick={() => setReasoningOn(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reasoningOn ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${reasoningOn ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

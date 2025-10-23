"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon, ChatBubbleLeftIcon, TrashIcon, PencilIcon, EnvelopeIcon, ArrowPathIcon, Cog6ToothIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import toast from "react-hot-toast";
import ActionSheet from "./ActionSheet";
import ConfirmModal from "./ConfirmModal";
import UserSettings from "./UserSettings";
import { useChatStore } from "../../stores";
import { useAuthStore } from "../../stores/useAuthStore";
import { formatConversationTimestamp } from "../../lib/utils/dateFormat";
import { logger } from "../../lib/utils/logger";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  className?: string;
  showMobileHint?: boolean;
}

export function ChatSidebar({ isOpen, onClose, onNewChat, className = "", showMobileHint = true }: ChatSidebarProps) {
  // Get conversation data from store
  const {
    conversations,
    currentConversationId,
    switchConversation,
    deleteConversation,
    updateConversationTitle,
    loadMoreConversations,
    clearAllConversations,
    isHydrated,
    searchQuery,
    searchMode,
    searchResults,
    searchLoading,
    searchError,
    performLocalSearch,
    performServerSearch,
    clearSearch,
  } = useChatStore();
  
  // Get auth state
  const { isAuthenticated } = useAuthStore();
  
  // Local search input state
  const [searchInput, setSearchInput] = useState<string>("");
  const debouncedSearchRef = useRef<NodeJS.Timeout | null>(null);
  
  // Search mode preference (client or server)
  const [preferredSearchMode, setPreferredSearchMode] = useState<'local' | 'server'>('local');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sheetOpenFor, setSheetOpenFor] = useState<string | null>(null);
  const [editingInSheet, setEditingInSheet] = useState(false);
  const [sheetEditTitle, setSheetEditTitle] = useState("");
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [hasHover, setHasHover] = useState(true);

  // Search handlers
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    
    // Clear existing debounce timer
    if (debouncedSearchRef.current) {
      clearTimeout(debouncedSearchRef.current);
    }
    
    // Different debounce times: client search is faster (300ms), server search waits longer (800ms)
    const debounceDelay = (preferredSearchMode === 'server' && isAuthenticated) ? 800 : 300;
    
    debouncedSearchRef.current = setTimeout(() => {
      if (value.trim().length > 0) {
        // Call the appropriate search function based on preferred mode
        if (preferredSearchMode === 'server' && isAuthenticated) {
          performServerSearch(value.trim());
        } else {
          // Fallback to local search if not authenticated or local mode selected
          performLocalSearch(value.trim());
        }
      } else {
        clearSearch();
      }
    }, debounceDelay);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    clearSearch();
    if (debouncedSearchRef.current) {
      clearTimeout(debouncedSearchRef.current);
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedSearchRef.current) {
        clearTimeout(debouncedSearchRef.current);
      }
    };
  }, []);

  // Re-trigger search when search mode changes (if there's an active search query)
  // Note: searchInput is NOT in dependency array to avoid triggering on every keystroke
  useEffect(() => {
    if (searchInput.trim().length > 0) {
      // Clear existing debounce timer
      if (debouncedSearchRef.current) {
        clearTimeout(debouncedSearchRef.current);
      }
      
      // Immediately trigger search with new mode
      if (preferredSearchMode === 'server' && isAuthenticated) {
        performServerSearch(searchInput.trim());
      } else {
        performLocalSearch(searchInput.trim());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredSearchMode, isAuthenticated]);

  // Detect whether the device supports hover (desktop) vs touch (mobile)
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mq = window.matchMedia('(hover: hover)');
    const update = () => setHasHover(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // One-time discoverability hint for mobile/touch users when sidebar becomes visible
  useEffect(() => {
    if (hasHover || !isOpen || !showMobileHint) return; // desktop or sidebar hidden
    try {
      const key = 'chatSidebar.longpress.hint.v1';
      if (!localStorage.getItem(key)) {
        toast('Tip: Long‑press a chat to delete or edit.', { id: 'longpress-tip', duration: 4000 });
        localStorage.setItem(key, '1');
      }
    } catch {
      // ignore storage errors
    }
  }, [hasHover, isOpen, showMobileHint]);

  // When the action sheet opens, ensure the target row is visible
  useEffect(() => {
    if (!sheetOpenFor || typeof document === 'undefined') return;
    const el = document.getElementById(`conv-row-${sheetOpenFor}`);
    if (el) {
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch {
        // no-op
      }
    }
  }, [sheetOpenFor]);

  // Sidebar now relies on store-managed paginated list; initial load is orchestrated by useChatSync
  const sidebarPaging = useChatStore(s => s.sidebarPaging);

  const handleStartEdit = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = async (id: string) => {
    if (editTitle.trim()) {
      try {
        await updateConversationTitle(id, editTitle.trim());
        toast.success('Conversation title updated.');
      } catch (error) {
  logger.warn('ui.sidebar.updateTitle.failed', { id, err: (error as Error)?.message });
        toast.error('Failed to update conversation title.');
      }
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await deleteConversation(id);
  toast.success('Conversation deleted successfully.');
    } catch (error) {
  logger.warn('ui.sidebar.deleteConversation.failed', { id, err: (error as Error)?.message });
      alert('Failed to delete conversation. Please try again.');
    }
  };

  const handleConversationClick = (id: string) => {
    switchConversation(id);
    // Close mobile sidebar after selection
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onClose();
    }
  };

  const handleClearAllConversations = async () => {
    if (conversations.length === 0) return;
    setShowConfirmModal(true);
  };

  const confirmClearAll = async () => {
    try {
      await clearAllConversations();
    } catch (error) {
  logger.warn('ui.sidebar.clearAll.failed', { err: (error as Error)?.message });
      alert('Failed to clear conversations. Please try again.');
    } finally {
      setShowConfirmModal(false);
    }
  };

  const getLastMessage = (messages: Array<{ content: string; role: string }>) => {
    if (messages.length === 0) return "No messages yet";
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content;
    return content.length > 60 ? content.substring(0, 60) + "..." : content;
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <button 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClose();
            }
          }}
          aria-label="Close sidebar"
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 lg:z-0
          w-64 lg:w-full h-full mobile-safe-area
          bg-slate-50 dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
          ${className}
        `}
      >
  {/* Header */}
  <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-gray-800">
          <Button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <PlusIcon className="w-4 h-4" />
            New Chat
          </Button>
          
          
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto">
          
          <div className="px-4 sm:px-6 py-4">
            
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Recent Chats
            </h3>

            {/* Search Input */}
            <div className="mb-3 space-y-2">
              {/* Search mode toggle (only for authenticated users) */}
              {isAuthenticated && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Search mode:</span>
                  <button
                    onClick={() => setPreferredSearchMode('local')}
                    className={`px-2 py-1 rounded transition-colors ${
                      preferredSearchMode === 'local'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Client
                  </button>
                  <button
                    onClick={() => setPreferredSearchMode('server')}
                    className={`px-2 py-1 rounded transition-colors ${
                      preferredSearchMode === 'server'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Server
                  </button>
                </div>
              )}
              
              {/* Search input field */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={preferredSearchMode === 'server' ? 'Search all messages...' : 'Search conversations...'}
                  className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={searchLoading}
                />
                {searchLoading ? (
                  <ArrowPathIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />
                ) : searchInput ? (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Search Results Banner */}
            {(searchMode === 'local' || searchMode === 'server') && searchQuery && (
              <div className="mb-3">
                {searchError ? (
                  <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                    <div className="text-xs text-red-700 dark:text-red-300">
                      Search failed: {searchError}
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
                    <div className="text-xs text-emerald-700 dark:text-emerald-300">
                      {searchResults.length === 0 ? (
                        <span>No conversations found for &quot;{searchQuery}&quot;</span>
                      ) : (
                        <div>
                          <div className="font-medium">
                            Found {searchResults.length} conversation{searchResults.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
                          </div>
                          <div className="text-emerald-600 dark:text-emerald-400 mt-1">
                            {searchMode === 'server' ? '🔍 Searching all messages' : '📱 Client-side search'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-1">
              {(searchMode === 'local' || searchMode === 'server') && searchQuery ? (
                // Show search results
                searchResults.map((conversation, index) => (
                <div
                  key={conversation.id}
                  id={`conv-row-${conversation.id}`}
                  aria-selected={sheetOpenFor === conversation.id}
                  data-action-target={sheetOpenFor === conversation.id ? 'true' : 'false'}
      className={`group p-3 rounded-lg cursor-pointer border transition-all duration-200 relative select-none touch-pan-y ${
                    conversation.id === currentConversationId
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 shadow-sm'
                      : index % 2 === 0
        ? 'bg-gray-100/30 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border-transparent dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
                  } ${sheetOpenFor === conversation.id ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-gray-800 shadow-md' : ''} ${sheetOpenFor && sheetOpenFor !== conversation.id ? 'opacity-60' : ''}`}
                  style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                  onClick={() => handleConversationClick(conversation.id)}
                  onContextMenu={(e) => {
                    // Prevent iOS Safari "Copy/Look Up" sheet during long-press
                    e.preventDefault();
                  }}
                  onPointerDown={(e) => {
                    // Enable long-press only on non-hover (mobile/touch) devices
                    if (hasHover) return;
                    pointerStart.current = { x: e.clientX, y: e.clientY };
                    // Cancel any prior timer
                    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
                    longPressTimer.current = window.setTimeout(() => {
                      setSheetOpenFor(conversation.id);
                    }, 500); // 500ms threshold
                  }}
                  onPointerMove={(e) => {
                    if (hasHover) return;
                    if (!pointerStart.current || longPressTimer.current == null) return;
                    const dx = Math.abs(e.clientX - pointerStart.current.x);
                    const dy = Math.abs(e.clientY - pointerStart.current.y);
                    // Cancel if finger moves significantly (likely scrolling)
                    if (dx > 8 || dy > 8) {
                      window.clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                  }}
                  onPointerUp={() => {
                    if (hasHover) return;
                    if (longPressTimer.current) {
                      window.clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                    pointerStart.current = null;
                  }}
                  onPointerCancel={() => {
                    if (hasHover) return;
                    if (longPressTimer.current) {
                      window.clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                    pointerStart.current = null;
                  }}
                >
                  {/* Action buttons overlay - only visible on hover */}
                  {editingId !== conversation.id && (
                    <div
                      className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto rounded-md p-1
                                 bg-white/95 ring-1 ring-gray-300/70 shadow-md
                                 dark:bg-gray-800/95 dark:ring-white/10 dark:shadow-sm"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation.id, conversation.title);
                        }}
                        className="p-1 rounded-md text-gray-600 hover:text-gray-800 hover:bg-gray-100
                                   dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700/60
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                        title="Edit title"
                      >
                        <PencilIcon className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(conversation.id);
                        }}
                        className="p-1 rounded-md text-gray-600 hover:text-red-600 hover:bg-red-50
                                   dark:text-gray-300 dark:hover:text-red-400 dark:hover:bg-red-900/30
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                        title="Delete chat"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="w-full"> {/* Remove right padding since buttons are absolutely positioned */}
                    <div className="flex-1 min-w-0">
                      {editingId === conversation.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit(conversation.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveEdit(conversation.id);
                              }}
                              className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelEdit();
                              }}
                              className="text-xs px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <ChatBubbleLeftIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {conversation.title}
                            </h4>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                            {conversation.lastMessagePreview ?? getLastMessage(conversation.messages)}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                              {formatConversationTimestamp(conversation.lastMessageTimestamp || "")}
                            </span>
                            <div className="flex items-center gap-1">
                              
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {conversation.messageCount}
                              </span>
                              <EnvelopeIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
              ) : (
                // Show all conversations when not searching
                conversations.map((conversation, index) => (
                <div
                  key={conversation.id}
                  id={`conv-row-${conversation.id}`}
                  aria-selected={sheetOpenFor === conversation.id}
                  data-action-target={sheetOpenFor === conversation.id ? 'true' : 'false'}
      className={`group p-3 rounded-lg cursor-pointer border transition-all duration-200 relative select-none touch-pan-y ${
                    conversation.id === currentConversationId
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 shadow-sm'
                      : index % 2 === 0
        ? 'bg-gray-100/30 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border-transparent dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
                  } ${sheetOpenFor === conversation.id ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-gray-800 shadow-md' : ''} ${sheetOpenFor && sheetOpenFor !== conversation.id ? 'opacity-60' : ''}`}
                  style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                  onClick={() => handleConversationClick(conversation.id)}
                  onContextMenu={(e) => {
                    // Prevent iOS Safari "Copy/Look Up" sheet during long-press
                    e.preventDefault();
                  }}
                  onPointerDown={(e) => {
                    // Enable long-press only on non-hover (mobile/touch) devices
                    if (hasHover) return;
                    pointerStart.current = { x: e.clientX, y: e.clientY };
                    // Cancel any prior timer
                    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
                    longPressTimer.current = window.setTimeout(() => {
                      setSheetOpenFor(conversation.id);
                    }, 500); // 500ms threshold
                  }}
                  onPointerMove={(e) => {
                    if (hasHover) return;
                    if (!pointerStart.current || longPressTimer.current == null) return;
                    const dx = Math.abs(e.clientX - pointerStart.current.x);
                    const dy = Math.abs(e.clientY - pointerStart.current.y);
                    // Cancel if finger moves significantly (likely scrolling)
                    if (dx > 8 || dy > 8) {
                      window.clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                  }}
                  onPointerUp={() => {
                    if (hasHover) return;
                    if (longPressTimer.current) {
                      window.clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                    pointerStart.current = null;
                  }}
                  onPointerCancel={() => {
                    if (hasHover) return;
                    if (longPressTimer.current) {
                      window.clearTimeout(longPressTimer.current);
                      longPressTimer.current = null;
                    }
                    pointerStart.current = null;
                  }}
                >
                  {/* Action buttons overlay - only visible on hover */}
                  {editingId !== conversation.id && (
                    <div
                      className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto rounded-md p-1
                                 bg-white/95 ring-1 ring-gray-300/70 shadow-md
                                 dark:bg-gray-800/95 dark:ring-white/10 dark:shadow-sm"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation.id, conversation.title);
                        }}
                        className="p-1 rounded-md text-gray-600 hover:text-gray-800 hover:bg-gray-100
                                   dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700/60
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                        title="Edit title"
                      >
                        <PencilIcon className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(conversation.id);
                        }}
                        className="p-1 rounded-md text-gray-600 hover:text-red-600 hover:bg-red-50
                                   dark:text-gray-300 dark:hover:text-red-400 dark:hover:bg-red-900/30
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                        title="Delete chat"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="w-full"> {/* Remove right padding since buttons are absolutely positioned */}
                    <div className="flex-1 min-w-0">
                      {editingId === conversation.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit(conversation.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveEdit(conversation.id);
                              }}
                              className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelEdit();
                              }}
                              className="text-xs px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <ChatBubbleLeftIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {conversation.title}
                            </h4>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                            {conversation.lastMessagePreview ?? getLastMessage(conversation.messages)}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                              {formatConversationTimestamp(conversation.lastMessageTimestamp || "")}
                            </span>
                            <div className="flex items-center gap-1">
                              
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {conversation.messageCount}
                              </span>
                              <EnvelopeIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
              )}
              {conversations.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <ChatBubbleLeftIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs mt-1">Start a new chat to begin</p>
                </div>
              )}

              {/* Load more control - hidden during search */}
              {isAuthenticated && sidebarPaging?.hasMore && searchMode === 'inactive' && (
                <div className="mt-3">
                  <button
                    className="w-full text-sm py-2 rounded-md border border-gray-300 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center gap-2"
                    disabled={sidebarPaging.loading}
                    onClick={() => loadMoreConversations && loadMoreConversations()}
                  >
                    {sidebarPaging.loading ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading…
                      </>
                    ) : (
                      <>Load more…</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
  <div className="px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-500">
              {!isHydrated ? "Loading conversations..." : searchMode === 'local' && searchQuery ? `${searchResults.length} of ${conversations.length} conversations` : `${conversations.length} total conversations`}
            </div>
            <div className="flex items-center gap-2">
              {isHydrated && isAuthenticated && (
                <button
                  onClick={handleSettingsClick}
                  className="p-1 text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors rounded"
                  title="Settings"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                </button>
              )}
              {isHydrated && conversations.length > 0 && (
                <button
                  onClick={handleClearAllConversations}
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded"
                  title="Clear all conversations"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
      <ActionSheet
        isOpen={!!sheetOpenFor}
        // title removed per request; keep only the context header
        contextTitle={sheetOpenFor ? (conversations.find(c => c.id === sheetOpenFor)?.title ?? '') : undefined}
        contextSubtitle={sheetOpenFor ? (
          conversations.find(c => c.id === sheetOpenFor)?.lastMessagePreview ??
          (conversations.find(c => c.id === sheetOpenFor)?.messages?.length
            ? (conversations.find(c => c.id === sheetOpenFor)!.messages!.slice(-1)[0].content).slice(0, 80)
            : undefined)
        ) : undefined}
        items={sheetOpenFor ? (
          editingInSheet ? [] : [
            {
              key: 'delete',
              label: 'Delete Conversation',
              destructive: true,
              onSelect: () => {
                const id = sheetOpenFor;
                setSheetOpenFor(null);
                setEditingInSheet(false);
                if (id) handleDeleteChat(id);
              },
            },
            {
              key: 'edit',
              label: 'Edit Title',
              onSelect: () => {
                const id = sheetOpenFor;
                if (!id) return;
                const conv = conversations.find(c => c.id === id);
                if (conv) {
                  setEditingInSheet(true);
                  setSheetEditTitle(conv.title);
                }
              },
            },
          ]
        ) : []}
        onClose={() => {
          setSheetOpenFor(null);
          setEditingInSheet(false);
          setSheetEditTitle("");
        }}
      >
        {editingInSheet && sheetOpenFor && (
          <div className="px-4 pb-3">
            <label htmlFor="sheet-edit-title" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Edit title
            </label>
            <input
              id="sheet-edit-title"
              type="text"
              value={sheetEditTitle}
              onChange={(e) => setSheetEditTitle(e.target.value)}
              className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-gray-900 dark:text-white"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  const id = sheetOpenFor;
                  if (!id) return;
                  const trimmed = sheetEditTitle.trim();
                  if (!trimmed) {
                    // no-op if empty
                    return;
                  }
                  try {
                    await updateConversationTitle(id, trimmed);
                    toast.success('Conversation title updated.');
                    setEditingInSheet(false);
                    setSheetOpenFor(null);
                  } catch (err) {
                    logger.warn('ui.sidebar.sheet.updateTitle.failed', { id: sheetOpenFor, err: (err as Error)?.message });
                  }
                }}
                className="text-sm px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingInSheet(false);
                }}
                className="text-sm px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </ActionSheet>
      <UserSettings
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
      <ConfirmModal
        isOpen={showConfirmModal}
        onConfirm={confirmClearAll}
        onCancel={() => setShowConfirmModal(false)}
        title="Delete all conversations?"
        description={`Are you sure you want to delete all ${conversations.length} conversations? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
}

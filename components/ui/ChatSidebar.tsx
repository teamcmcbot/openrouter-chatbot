"use client";

import { useState } from "react";
import { PlusIcon, ChatBubbleLeftIcon, TrashIcon, PencilIcon, EnvelopeIcon, ArrowPathIcon, CloudIcon, ComputerDesktopIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import ConfirmModal from "./ConfirmModal";
import UserSettings from "./UserSettings";
import { useChatStore } from "../../stores";
import { useAuthStore } from "../../stores/useAuthStore";
import { formatConversationTimestamp } from "../../lib/utils/dateFormat";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  className?: string;
}

export function ChatSidebar({ isOpen, onClose, onNewChat, className = "" }: ChatSidebarProps) {
  // Get conversation data from store
  const {
    conversations,
    currentConversationId,
    switchConversation,
    deleteConversation,
    updateConversationTitle,
    getRecentConversations,
    clearAllConversations,
    isHydrated,
  } = useChatStore();
  
  // Get auth state
  const { isAuthenticated } = useAuthStore();
  
  // Get sync state from chat store
  const { isSyncing, lastSyncTime, syncError } = useChatStore();
  
  // Create sync status object and manual sync function for the UI
  const syncStatus = {
    isSyncing,
    lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
    syncError,
    canSync: isAuthenticated
  };
  
  // Manual sync has been removed. Sync Status remains and updates after message persistence.
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Get recent conversations (limit to 20 for performance)
  // Only show conversations after hydration to prevent SSR mismatch
  const recentConversations = isHydrated ? getRecentConversations(20) : [];

  const handleStartEdit = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = async (id: string) => {
    if (editTitle.trim()) {
      try {
        await updateConversationTitle(id, editTitle.trim());
      } catch (error) {
        console.error('Failed to update conversation title:', error);
        // Could show a toast notification here
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
    } catch (error) {
      console.error('Failed to delete conversation:', error);
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
      console.error('Failed to clear all conversations:', error);
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
  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
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

            {/* Sync Status */}
          {isAuthenticated && (
            <div className="mb-3 px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {syncStatus.isSyncing ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">Syncing...</span>
                    </>
                  ) : syncStatus.syncError ? (
                    <>
                      <ComputerDesktopIcon className="w-4 h-4 text-red-500" />
                      <span className="text-xs text-red-600 dark:text-red-400">Sync failed</span>
                    </>
                  ) : syncStatus.lastSyncTime ? (
                    <>
                      <CloudIcon className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Synced {syncStatus.lastSyncTime.toLocaleTimeString()}
                      </span>
                    </>
                  ) : (
                    <>
                      <ComputerDesktopIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">Local only</span>
                    </>
                  )}
                </div>
                
                {/* Manual sync button removed */}
              </div>
              
              {syncStatus.syncError && (
                <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {syncStatus.syncError}
                </div>
              )}
            </div>
          )}
          
          {/* Non-authenticated prompt */}
          {!isAuthenticated && (
            <div className="mt-1 mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <span className="font-medium">Sign in to sync across devices</span>
                <br />
                Your chats are saved locally only
              </div>
            </div>
          )}
            
            <div className="space-y-1">
              {recentConversations.map((conversation, index) => (
                <div
                  key={conversation.id}
      className={`group p-3 rounded-lg cursor-pointer border transition-all duration-200 relative ${
                    conversation.id === currentConversationId
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 shadow-sm'
                      : index % 2 === 0
        ? 'bg-gray-100/30 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border-transparent dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
                  }`}
                  onClick={() => handleConversationClick(conversation.id)}
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
                            {getLastMessage(conversation.messages)}
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
              ))}
              
              {recentConversations.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <ChatBubbleLeftIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs mt-1">Start a new chat to begin</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
  <div className="px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-500">
              {isHydrated ? `${conversations.length} total conversations` : "Loading conversations..."}
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

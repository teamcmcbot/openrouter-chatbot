"use client";

import { useState } from "react";
import { PlusIcon, ChatBubbleLeftIcon, TrashIcon, PencilIcon, EnvelopeIcon, ArrowPathIcon, CloudIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import { useChatStore } from "../../stores";
import { useAuthStore } from "../../stores/useAuthStore";
import { useChatSync } from "../../hooks/useChatSync";

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
    isHydrated,
  } = useChatStore();
  
  // Get auth state and sync functionality
  const { isAuthenticated } = useAuthStore();
  const { manualSync, syncStatus } = useChatSync();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Get recent conversations (limit to 20 for performance)
  // Only show conversations after hydration to prevent SSR mismatch
  const recentConversations = isHydrated ? getRecentConversations(20) : [];

  const handleStartEdit = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      updateConversationTitle(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleDeleteChat = (id: string) => {
    deleteConversation(id);
  };

  const handleConversationClick = (id: string) => {
    switchConversation(id);
    // Close mobile sidebar after selection
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onClose();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getLastMessage = (messages: Array<{ content: string; role: string }>) => {
    if (messages.length === 0) return "No messages yet";
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content;
    return content.length > 60 ? content.substring(0, 60) + "..." : content;
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <button 
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
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
          fixed xl:static inset-y-0 left-0 z-50 xl:z-0
          w-64 xl:w-full h-full
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0'}
          flex flex-col
          ${className}
        `}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
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
          
          <div className="ml-2 p-4">
            
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Recent Chats
            </h3>

            {/* Sync Status */}
          {isAuthenticated && (
            <div className="mb-3 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
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
                
                {!syncStatus.isSyncing && (
                  <button
                    onClick={manualSync}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                    title="Sync now"
                  >
                    Sync
                  </button>
                )}
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
            <div className="mt-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
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
                        ? 'bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                        : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                  onClick={() => handleConversationClick(conversation.id)}
                >
                  {/* Action buttons overlay - only visible on hover */}
                  {editingId !== conversation.id && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-600 p-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation.id, conversation.title);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                        title="Edit title"
                      >
                        <PencilIcon className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(conversation.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
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
                              {formatTimestamp(conversation.updatedAt)}
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
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-500 text-center">
            {isHydrated ? `${conversations.length} total conversations` : "Loading conversations..."}
          </div>
        </div>
      </aside>
    </>
  );
}

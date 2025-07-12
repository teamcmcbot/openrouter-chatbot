"use client";

import { useState } from "react";
import { PlusIcon, ChatBubbleLeftIcon, TrashIcon, PencilIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import { useChatHistory } from "../../hooks/useChatHistory";
import { ChatConversation } from "../../lib/types/chat";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onConversationSelect?: (conversationId: string) => void;
  activeConversationId?: string | null;
  className?: string;
}

export function ChatSidebar({ 
  isOpen, 
  onClose, 
  onNewChat, 
  onConversationSelect,
  activeConversationId,
  className = "" 
}: ChatSidebarProps) {
  // Use real chat history data
  const { conversations, deleteConversation, updateConversation } = useChatHistory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEdit = (conversation: ChatConversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveEdit = (id: string) => {
    updateConversation(id, { title: editTitle });
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

  const handleConversationClick = (conversationId: string) => {
    if (onConversationSelect) {
      onConversationSelect(conversationId);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return timestamp.toLocaleDateString();
    }
  };

  const getLastMessagePreview = (conversation: ChatConversation) => {
    if (conversation.messages.length === 0) {
      return "No messages yet";
    }
    
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const preview = lastMessage.content.slice(0, 50);
    return preview.length < lastMessage.content.length ? `${preview}...` : preview;
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <button 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
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
          fixed md:static inset-y-0 left-0 z-50 md:z-0
          w-64 md:w-full h-full
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col
          ${className}
        `}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <Button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <PlusIcon className="w-4 h-4" />
            New Chat
          </Button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Recent Chats
            </h3>
            
            <div className="space-y-2">
              {conversations.length > 0 ? (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    onClick={() => handleConversationClick(conversation.id)}
                    className={`group p-3 rounded-lg cursor-pointer border transition-all duration-200 ${
                      activeConversationId === conversation.id
                        ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                    }`}
                  >
                  <div className="flex items-start justify-between gap-2">
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
                              className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
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
                            {getLastMessagePreview(conversation)}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                              {formatTimestamp(conversation.updatedAt)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                              {conversation.messageCount} messages
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {editingId !== conversation.id && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(conversation);
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
                  </div>
                </div>
              ))
              ) : (
                <div className="text-center py-8">
                  <ChatBubbleLeftIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No conversations yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Start a new chat to begin
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-500 text-center">
            {conversations.length} total conversations
          </div>
        </div>
      </aside>
    </>
  );
}

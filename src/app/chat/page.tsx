import ChatInterface from "../../../components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="h-full max-w-full mx-auto">
        <ChatInterface />
      </div>
    </div>
  );
}

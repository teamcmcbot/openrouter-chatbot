import ChatInterface from "../../../../components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="h-[calc(100vh-6rem)] sm:h-[calc(100vh-8rem)] max-w-4xl mx-auto">
        <ChatInterface />
      </div>
    </div>
  );
}

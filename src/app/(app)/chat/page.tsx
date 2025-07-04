import ChatInterface from "../../../components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
      <div className="h-full max-w-4xl mx-auto">
        <ChatInterface />
      </div>
    </div>
  );
}

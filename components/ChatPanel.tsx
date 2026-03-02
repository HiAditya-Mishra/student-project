"use client"

export default function ChatPanel() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      <div className="p-4 border-b dark:border-gray-700 font-semibold">
        Live Chat
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded-lg">
          Hello 👋
        </div>
      </div>

      <div className="p-3 border-t dark:border-gray-700">
        <input
          placeholder="Type a message..."
          className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 outline-none"
        />
      </div>
    </div>
  )
}
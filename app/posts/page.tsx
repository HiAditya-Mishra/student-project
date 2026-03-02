"use client";

import { useState } from "react";
import { Post } from "@/types/post";

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  function addPost() {
    if (!title || !content) return;

    const newPost: Post = {
      id: Date.now(),
      title,
      content,
      anonymous,
    };

    setPosts([newPost, ...posts]);
    setTitle("");
    setContent("");
    setAnonymous(false);
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Student Posts</h1>

      {/* Create Post */}
      <div className="mt-6 p-4 border rounded">
        <input
          className="w-full border p-2 rounded mb-2"
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="w-full border p-2 rounded mb-2"
          placeholder="Write your post..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <label className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={() => setAnonymous(!anonymous)}
          />
          Post anonymously
        </label>

        <button
          onClick={addPost}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Post
        </button>
      </div>

      {/* Posts List */}
      <div className="mt-8 space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="p-4 border rounded">
            <h2 className="text-xl font-semibold">{post.title}</h2>
            <p className="mt-2">{post.content}</p>
            <p className="mt-2 text-sm text-gray-500">
              {post.anonymous ? "Anonymous" : "Student"}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
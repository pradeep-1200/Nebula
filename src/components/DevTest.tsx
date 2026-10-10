import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function DevTest() {
  const [name, setName] = useState("");
  const [greetMsg, setGreetMsg] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-800 rounded-lg">
      <h2 className="text-xl font-bold">Phase 1: Bridge Test</h2>
      <div className="flex gap-2">
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
          className="px-2 py-1 bg-gray-700 text-white rounded outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={greet}
          className="px-4 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium transition"
        >
          Greet
        </button>
      </div>
      <p className="text-gray-300 min-h-[1.5rem]">{greetMsg}</p>
    </div>
  );
}

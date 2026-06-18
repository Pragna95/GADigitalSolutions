import { useState, useEffect } from "react";
import { Bell, Plus, Search, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import api from "../../services/api";

const colors = [
  "from-blue-400 to-indigo-500",
  "from-green-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500"
];

export default function ChatList({ selectedRoom, onSelectRoom }) {
  const [rooms, setRooms] = useState([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await api.get("/api/chat/rooms/");
        setRooms(res.data);
        if (!selectedRoom && res.data.length > 0) {
          onSelectRoom(res.data[0]);
        }
      } catch (err) {
        console.error("Error fetching rooms:", err);
      }
    };
    fetchRooms();
  }, [selectedRoom, onSelectRoom]);

  // Distinguish channels vs general chats
  const channels = rooms.filter(r => ["general", "ux-ui-team", "meme"].includes(r.name));
  const chats = rooms.filter(r => !["general", "ux-ui-team", "meme"].includes(r.name));

  const formatTime = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  };

  return (
    <div className="w-full max-w-[324px] md:w-[324px] h-[824px] flex flex-col bg-white border border-gray-100 rounded-[12px] overflow-y-auto flex-shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.01)] transition-all duration-300">
      
      {/* Announcements */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100/80 cursor-pointer border-b border-gray-100/60 rounded-[8px] w-full h-[48px] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm mb-1">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
          <Bell className="w-[16px] h-[16px] text-gray-600 animate-bounce-subtle" />
        </div>
        <span className="flex-1 text-[14px] font-medium text-gray-700">Announcements</span>
        <span className="w-[24px] h-[24px] bg-[#0046BB] text-white text-[12px] rounded-full flex items-center justify-center font-bold shadow-[0_2px_6px_rgba(0,70,187,0.2)]">
          01
        </span>
      </div>

      {/* Huddles */}
      <div className="w-full h-[48px] rounded-[8px] bg-[#002266] hover:bg-[#001d57] flex items-center gap-3 px-4 py-3 cursor-pointer hover:shadow-md hover:shadow-blue-500/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center">
          <img src="mon.svg" alt="Dash" className="w-[18px] h-[18px]" />
        </div>
        <span className="flex-1 text-sm font-semibold text-white">Huddles</span>
      </div>

      {/* Channels */}
      <div className="px-4 pt-4 pb-2 h-[304px] w-full">
        <div className="flex items-center justify-between mb-3 h-[36px] w-full">
          <span className="text-[12px] font-bold text-[#001744] uppercase tracking-wider">Channels</span>
          <button className="text-[#28303F] hover:text-blue-600 hover:scale-110 active:scale-95 transition-all h-[20px] w-[20px] cursor-pointer">
            <Plus className="w-[14px] h-[14px]" />
          </button>
        </div>

        <div className="relative mb-3 h-[40px] w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-gray-400" />
          <Input
            value={channelSearch}
            onChange={(e) => setChannelSearch(e.target.value)}
            placeholder="search"
            className="pl-8 h-8 text-[12px] border-gray-200 bg-gray-50 focus:bg-white rounded-lg w-full transition-all duration-200 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
          />
        </div>

        <div className="flex flex-col gap-1 overflow-y-auto max-h-[170px]">
          {channels
            .filter((c) => c.display_name.toLowerCase().includes(channelSearch.toLowerCase()))
            .map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectRoom(c)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 text-left w-full cursor-pointer hover:translate-x-1 ${
                  selectedRoom?.id === c.id
                    ? "bg-blue-50 text-[#1D4ED8] font-bold border-l-2 border-[#1D4ED8] rounded-l-none"
                    : "text-[#475569] hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                {c.display_name}
              </button>
            ))}
        </div>

        <div className="flex justify-end mt-2">
          <button className="text-[12px] text-[#0C405E] hover:text-blue-600 font-semibold transition-colors cursor-pointer">
            View All
          </button>
        </div>
      </div>

      {/* Chats */}
      <div className="px-4 pt-3 border-t border-gray-100">
        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-3">
          General chats
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="search"
            className="pl-8 h-8 text-xs border-gray-200 bg-gray-50 focus:bg-white rounded-lg w-full transition-all duration-200 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[280px]">
          {chats
            .filter((c) => c.display_name.toLowerCase().includes(chatSearch.toLowerCase()))
            .map((chat, idx) => {
              const color = colors[idx % colors.length];
              const lastMsgText = chat.last_message ? chat.last_message.content : "No messages yet";
              const lastMsgTime = chat.last_message ? formatTime(chat.last_message.timestamp) : "";

              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectRoom(chat)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50/80 hover:scale-[1.01] hover:shadow-[0_2px_8px_rgba(0,0,0,0.03)] active:scale-[0.99] border transition-all duration-200 text-left w-full cursor-pointer ${
                    selectedRoom?.id === chat.id
                      ? "bg-blue-50/50 border-blue-100 shadow-sm"
                      : "border-transparent hover:border-gray-100/50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${color} flex-shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08)]`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 truncate">
                        {chat.display_name}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                        {lastMsgTime}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{lastMsgText}</p>
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
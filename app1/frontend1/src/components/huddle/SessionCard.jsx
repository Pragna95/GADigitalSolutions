import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import AISummaryCard from "@/components/chat/AISummaryCard";
import TranscriptModal from "@/components/chat/TranscriptModal";
import toast from "react-hot-toast";
import { microserviceApi } from "@/services/api";
import { Share2 } from "lucide-react";

function handleTranscript(session) {
  fetch(`/api/transcripts/${session.id}`)
    .then((res) => res.json())
    .then((data) => {
      alert(`Transcript for "${session.title}":\n\n${data.transcript}`);
    })
    .catch((err) => {
      console.error("Error fetching transcript:", err);
      alert("Sorry, transcript could not be generated.");
    });
}

export default function SessionCard({ session, onRefresh, isSelected, onToggleSelect, onOpenTranscript,onOpenSummary }) {
  

  const navigate = useNavigate();

  return (
    <div
      className={`rounded-xl border ${["Ongoing", "Scheduled", "Completed"].includes(session.status)
        ? "border-[#1e2b72]/30 hover:border-[#1e2b72]"
        : "border-gray-200 hover:border-gray-300"
        } bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected || false}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          )}
          <p className="text-[11px] font-bold text-[#1e2b72] uppercase tracking-wider">
            {session.project}
          </p>
        </div>

        {session.status === "Ongoing" && (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm border border-red-100">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse-red" />
            LIVE
          </span>
        )}
      </div>

      {/* Title & Description */}
      <h2 className="text-sm font-bold text-gray-900 mb-1">
        {session.title}
      </h2>

      <p className="text-xs text-gray-500 leading-relaxed mb-3">
        {session.description}
      </p>

      {/* Participants & Time */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <div className="flex items-center gap-1.5">
          <img
            src="/avatars/avatar1.png"
            alt="participant"
            className="w-5 h-5 rounded-full border border-white shadow-sm"
            onError={(e) => {
              e.target.src = "https://i.pravatar.cc/50?u=1";
            }}
          />
          <img
            src="/avatars/avatar2.png"
            alt="participant"
            className="w-5 h-5 rounded-full border border-white shadow-sm"
            onError={(e) => {
              e.target.src = "https://i.pravatar.cc/50?u=2";
            }}
          />

          <span className="bg-gray-100 text-gray-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            +{session.participants}
          </span>

          <span className="ml-1.5 font-medium text-gray-400">{session.time}</span>
        </div>

        {(session.status === "Scheduled" ||
          session.status === "Completed") &&
          session.date && (
            <span className="text-gray-400 font-medium">{session.date}</span>
          )}
      </div>

      {/* Action Buttons */}
      <div className="mt-1">
        {session.status === "Ongoing" && (
          <div className="flex gap-2 items-center w-full mt-2">
            <button
              onClick={() => {
                if (session.isDatabase && session.link) {
                  navigate(session.link);
                } else {
                  navigate("/meeting");
                }
              }}
              className="flex-1 bg-gradient-to-r from-[#002266] to-[#0c3aa3] hover:from-[#001744] hover:to-[#0a318a] hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 text-white py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
            >
              Join Room
            </button>
            
            {session.title === "Instant Huddle" && (
              <button
                onClick={async () => {
                  const fullLink = `${window.location.origin}${session.link}`;
                  try {
                    await navigator.clipboard.writeText(fullLink);
                    toast.success("Link copied!");
                  } catch (e) {
                    toast.error("Failed to copy link");
                  }
                  if (navigator.share) {
                    navigator.share({
                      title: 'Join my Huddle Meeting',
                      text: 'Click the link to join my huddle meeting',
                      url: fullLink,
                    }).catch(console.warn);
                  }
                }}
                className="shrink-0 p-2 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-[#1e2b72] border border-slate-200 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center h-8 w-8"
                title="Share Meeting"
              >
                <Share2 className="size-4" />
              </button>
            )}
          </div>
        )}

        {session.status === "Scheduled" && session.date && (
          <p className="text-gray-400 italic text-xs">
            Scheduled for {session.date}
          </p>
        )}

        {session.status === "Completed" && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {/* AI SUMMARY */}
            <div
              className="
                                p-[1px]
                                rounded-[13px]
                                bg-[linear-gradient(90deg,#ff7a18,#ff4fd8,#3b82f6,#1d4ed8)]
                                hover:shadow-md
                                transition-all
                                duration-300
                                hover:-translate-y-0.5
                                active:translate-y-0
                            "
            >
              <button
                onClick={() => onOpenSummary(session)}
                className="
    h-[36px]
    min-w-[110px]
    px-3
    rounded-[12px]
    bg-white
    text-[#0046BB]
    text-[13px]
    font-semibold
    flex
    items-center
    justify-center
    transition-all
    duration-300
    whitespace-nowrap
    hover:bg-[#002266]
    hover:text-white
    cursor-pointer"
              >
                AI Summary
              </button>
            </div>

           

            {/* VIEW TRANSCRIPT */}
            <button
              onClick={() => onOpenTranscript(session)}
              className="
    shadow-[0_4px_12px_rgba(0,34,102,0.08)]
    h-[36px]
    min-w-[110px]
    px-3
    rounded-[13px]
    bg-white
    border
    border-[#002266]
    text-[#002266]
    text-[13px]
    font-semibold
    flex
    items-center
    justify-center
    transition-all
    duration-300
    whitespace-nowrap
    hover:bg-[#002266]
    hover:text-white
    hover:-translate-y-0.5
    active:translate-y-0
    hover:shadow-md
    cursor-pointer
  "
            >
              View Transcript
            </button>
      
            {/* VIEW RECORDING */}
            <button
              className="
    shadow-[0_4px_12px_rgba(0,34,102,0.08)]
    h-[36px]
    min-w-[110px]
    px-3
    rounded-[13px]
    bg-white
    border
    border-[#002266]
    text-[#002266]
    text-[13px]
    font-semibold
    flex
    items-center
    justify-center
    transition-all
    duration-300
    whitespace-nowrap
    hover:bg-[#002266]
    hover:text-white
    hover:-translate-y-0.5
    active:translate-y-0
    hover:shadow-md
    cursor-pointer
  "
            >
              View Recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
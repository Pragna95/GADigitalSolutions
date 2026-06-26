import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Mail, CheckCircle2, X } from "lucide-react";
import { microserviceApi } from "../../services/api";
import toast from "react-hot-toast";

const STORAGE_KEY = (meetingId) => `invited_participants_${meetingId}`;

export default function AddParticipantModal({ open, setOpen, meetingId }) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [invitedList, setInvitedList] = useState([]);

    useEffect(() => {
        if (open && meetingId) {
            try {
                const stored = localStorage.getItem(STORAGE_KEY(meetingId));
                if (stored) setInvitedList(JSON.parse(stored));
            } catch { /* ignore */ }
        }
    }, [open, meetingId]);

    const persistInvited = (list) => {
        try {
            localStorage.setItem(STORAGE_KEY(meetingId), JSON.stringify(list));
        } catch { /* ignore */ }
        setInvitedList(list);
    };

    const parsedEmails = email.split(",").map((e) => e.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleInvite = async (e) => {
        e.preventDefault();
        if (parsedEmails.length === 0) return;

        const invalidEmails = parsedEmails.filter((e) => !emailRegex.test(e));
        if (invalidEmails.length > 0) {
            toast.error(`Invalid email format: ${invalidEmails.join(", ")}`);
            return;
        }

        const newEmails = parsedEmails.filter((em) => !invitedList.includes(em));
        if (newEmails.length === 0) {
            toast(`All these emails were already invited.`, { icon: "ℹ️" });
            setEmail("");
            return;
        }

        setLoading(true);
        try {
            const apiKey =
                import.meta.env.VITE_X_API_KEY ||
                sessionStorage.getItem("api_key") ||
                localStorage.getItem("api_key") ||
                "";

            await Promise.all(
                newEmails.map((singleEmail) =>
                    microserviceApi.post(
                        "/api/meeting/invite/",
                        { meeting_id: meetingId, email: singleEmail },
                        { headers: { "X-Api-Key": apiKey } }
                    )
                )
            );

            toast.success(`Successfully invited ${newEmails.length} participant(s)!`);
            persistInvited([...invitedList, ...newEmails]);
            setEmail("");
        } catch (error) {
            console.error("Invite error:", error);
            toast.error(
                error.response?.data?.error ||
                    "Failed to send invitation(s) due to server error."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveInvited = (emailToRemove) => {
        persistInvited(invitedList.filter((em) => em !== emailToRemove));
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[480px] p-6 bg-white border border-slate-150 rounded-3xl shadow-2xl max-w-[95vw]">
                <DialogHeader className="border-b border-slate-100 pb-4">
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Mail className="size-5 text-[#1e2b72]" />
                        Invite Participant
                    </DialogTitle>
                    <p className="text-xs text-slate-400 mt-1 font-normal">
                        Only the host can invite participants to this meeting.
                    </p>
                </DialogHeader>

                <form onSubmit={handleInvite} className="space-y-4 pt-4 text-left">
                    <div className="space-y-2">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                            Email Address
                        </label>
                        <Input
                            type="text"
                            placeholder="Add emails separated by commas..."
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            className="w-full pl-3 pr-3 py-2 border border-slate-200 rounded-xl focus:border-[#1e2b72] focus:ring-1 focus:ring-[#1e2b72] outline-none"
                        />

                        {/* Live chip preview of typed emails */}
                        {parsedEmails.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {parsedEmails.map((em) => {
                                    const isValid = emailRegex.test(em);
                                    const alreadyInvited = invitedList.includes(em);
                                    return (
                                        <span
                                            key={em}
                                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                                                alreadyInvited
                                                    ? "bg-green-50 border-green-200 text-green-700"
                                                    : isValid
                                                    ? "bg-blue-50 border-blue-200 text-[#1e2b72]"
                                                    : "bg-red-50 border-red-200 text-red-600"
                                            }`}
                                        >
                                            {alreadyInvited ? "✓ " : ""}{em}
                                            {!isValid && " (invalid)"}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Already invited participants */}
                    {invitedList.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                                Already Invited ({invitedList.length})
                            </p>
                            <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1">
                                {invitedList.map((em) => (
                                    <div
                                        key={em}
                                        className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl group"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                            <span className="text-xs font-semibold text-slate-700 truncate">
                                                {em}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveInvited(em)}
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer"
                                            title="Remove from list"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                            className="px-4 h-10 rounded-xl cursor-pointer border-slate-200 hover:bg-slate-50 text-slate-700 bg-white"
                        >
                            Close
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="px-5 h-10 rounded-xl bg-[#1e2b72] hover:bg-[#152060] text-white font-bold flex items-center gap-2 cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                "Send Invite"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

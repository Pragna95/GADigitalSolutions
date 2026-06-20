import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Mail } from "lucide-react";
import { microserviceApi } from "../../services/api";
import toast from "react-hot-toast";

export default function AddParticipantModal({ open, setOpen, meetingId }) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            toast.error("Please enter a valid email address.");
            return;
        }

        setLoading(true);
        try {
            const apiKey = import.meta.env.VITE_X_API_KEY || localStorage.getItem("api_key") || "";
            const response = await microserviceApi.post(
                "/api/meeting/invite/",
                {
                    meeting_id: meetingId,
                    email: email.trim(),
                },
                {
                    headers: {
                        "X-Api-Key": apiKey,
                    },
                }
            );

            if (response.status === 200) {
                toast.success(`Invitation sent to ${email.trim()} successfully!`);
                setEmail("");
                setOpen(false);
            } else {
                toast.error(response.data?.error || "Failed to send invitation.");
            }
        } catch (error) {
            console.error("Invite error:", error);
            toast.error(
                error.response?.data?.error || "Failed to send invitation due to server error."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[450px] p-6 bg-white border border-slate-150 rounded-3xl shadow-2xl max-w-[90vw]">
                <DialogHeader className="border-b border-slate-100 pb-4">
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Mail className="size-5 text-[#1e2b72]" />
                        Invite Participant
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleInvite} className="space-y-4 pt-4 text-left">
                    <div className="space-y-2">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                            Email Address
                        </label>
                        <div className="relative">
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                className="w-full pl-3 pr-3 py-2 border border-slate-200 rounded-xl focus:border-[#1e2b72] focus:ring-1 focus:ring-[#1e2b72] outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                            className="px-4 h-10 rounded-xl cursor-pointer border-slate-200 hover:bg-slate-50 text-slate-700 bg-white"
                        >
                            Cancel
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

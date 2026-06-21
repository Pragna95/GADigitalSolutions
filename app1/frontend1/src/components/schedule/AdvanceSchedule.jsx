import { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import api, { microserviceApi } from "../../services/api";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, ChevronDown } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "Su"];

export default function AdvanceSchedule({
    open,
    setOpen,
    onAddSession,
    onCancelSession,
}) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startDate, setStartDate] = useState(null);
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("10:00");

    const [meetingLink, setMeetingLink] = useState("");
    const [loading, setLoading] = useState(false);

    // ✅ NEW CHECKBOX STATES
    const [allDay, setAllDay] = useState(false);
    const [neverEnds, setNeverEnds] = useState(true);

    const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]);

    const [recurrenceType, setRecurrenceType] = useState("Never");

    const [attendeesList, setAttendeesList] = useState([]);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [newEmail, setNewEmail] = useState("");
    const [attendeeError, setAttendeeError] = useState("");
    const [errors, setErrors] = useState({});
    // 🔥 STEP 1: Time helpers
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM


    const isTodaySelected = () => {
        if (!startDate) return false;

        const today = new Date();

        const selected = new Date(startDate);

        return (
            today.getFullYear() === selected.getFullYear() &&
            today.getMonth() === selected.getMonth() &&
            today.getDate() === selected.getDate()
        );
    };

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await api.get("/api/auth/users/");
                if (response.data) {
                    setAvailableUsers(response.data);
                }
            } catch (error) {
                console.error("Failed to fetch users", error);
            }
        };
        fetchUsers();
    }, []);

    const handleAddAttendee = () => {
        setAttendeeError("");
        const rawInput = newEmail.trim();
        if (!rawInput) return;

        const emails = rawInput
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);

        if (emails.length === 0) return;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = emails.filter((e) => !emailRegex.test(e));
        if (invalidEmails.length > 0) {
            setAttendeeError(`Invalid email(s): ${invalidEmails.join(", ")}`);
            return;
        }

        const newEmailsToAdd = emails.filter(
            (emailStr) =>
                !attendeesList.some(
                    (a) => a.email.toLowerCase() === emailStr.toLowerCase(),
                )
        );

        if (newEmailsToAdd.length === 0) {
            setAttendeeError("All entered email(s) are already added/invited");
            return;
        }

        const addedAttendees = newEmailsToAdd.map((emailStr) => {
            const matchedUser = availableUsers.find(
                (u) => u.email.toLowerCase() === emailStr.toLowerCase(),
            );
            const namePart = matchedUser
                ? matchedUser.name || matchedUser.username
                : emailStr.split("@")[0];
            const capitalizedName =
                namePart.charAt(0).toUpperCase() + namePart.slice(1);
            return { name: capitalizedName, email: emailStr };
        });

        setAttendeesList((prev) => [...prev, ...addedAttendees]);
        setNewEmail("");
    };

    const handleRemoveAttendee = (email) => {
        setAttendeesList((prev) => prev.filter((a) => a.email !== email));
    };

    const toggleDay = (index) => {
        setSelectedDays((prev) =>
            prev.includes(index)
                ? prev.filter((d) => d !== index)
                : [...prev, index],
        );
    };

    const handleScheduleMeeting = async () => {
        const newErrors = {};

        // TITLE
        if (!title.trim()) {
            newErrors.title = "Meeting title is required";
        }

        // DATE CHECK
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const selectedDate = startDate ? new Date(startDate) : null;

        if (!selectedDate) {
            newErrors.startDate = "Start date is required";
        } else {
            selectedDate.setHours(0, 0, 0, 0);

            if (selectedDate < today) {
                newErrors.startDate = "Past dates are not allowed";
            }

            // TIME LOGIC
            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 5);

            const start = new Date(`1970-01-01T${startTime}`);
            const end = new Date(`1970-01-01T${endTime}`);
            const current = new Date(`1970-01-01T${currentTime}`);

            const isToday =
                selectedDate.getTime() === today.getTime();

            if (isToday) {
                if (start < current) {
                    newErrors.startTime =
                        "Start time cannot be in the past";
                    toast.error("Start time is in the past");
                }

                if (end < current) {
                    newErrors.endTime =
                        "End time cannot be in the past";

                }
            }

            // GLOBAL RULE
            
            if (start >= end) {
                newErrors.endTime =
                    "End time must be greater than start time";

            }
        }

        // TIME REQUIRED CHECK
        if (!startTime) {
            newErrors.startTime = "Start time is required";
        }

        if (!endTime) {
            newErrors.endTime = "End time is required";
        }



        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            toast.error("Please fix the highlighted errors before scheduling");
            return;
        }
        if (attendeesList.length === 0) {
            toast.error("Please add at least one participant");
            return;
        }
        setErrors({});

        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const apiKey = import.meta.env.VITE_X_API_KEY || localStorage.getItem("api_key") || "";

            let userEmail = localStorage.getItem("email") || "host@example.com";
            let userName = localStorage.getItem("name") || "Host User";

            // Fetch user details from the access token if available
            if (token) {
                try {
                    const base64Url = token.split('.')[1];
                    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    }).join(''));
                    const decoded = JSON.parse(jsonPayload);
                    if (decoded.email) userEmail = decoded.email;
                    if (decoded.name) userName = decoded.name;
                } catch (e) {
                    console.warn("Could not decode token", e);
                }
            }

            const participant_emails = attendeesList.map((a) => a.email);
            const dateStr = startDate ? format(startDate, "yyyy-MM-dd") : "";
            const datetime = `${dateStr}T${startTime}`;

            let response;
            let data;
            try {
                response = await microserviceApi.post("/api/meeting/schedule/", {
                    email: userEmail,
                    name: userName,
                    title,
                    description,
                    datetime,
                    participant_emails,
                }, {
                    headers: {
                        "X-Api-Key": apiKey,
                    }
                });
                data = response.data;
            } catch (err) {
                console.error("[AdvanceSchedule] API Error:", err);
                toast.error(err.response?.data?.error || "Server returned an unexpected response.");
                return;
            }

            if (response.status === 201) {
                // Use the backend-provided meeting_link or meeting_path, with fallback
                const fullLink = data.meeting_link || (data.meeting_path ? `${window.location.origin}${data.meeting_path}` : `${window.location.origin}/${data.meeting_code}/${data.meeting_id}`);

                toast.success(`Meeting scheduled! Link copied to clipboard.`);
                try {
                    await navigator.clipboard.writeText(fullLink);
                } catch (_) { }

                onAddSession({
                    title,
                    description,
                    startDate,
                    startTime,
                    endTime,
                    participants: attendeesList.length,
                    link: fullLink,
                    meeting_id: data.meeting_id,
                });

                setOpen(false);
                // Reset form
                setTitle("");
                setDescription("");
                setStartDate(null);
                setStartTime("09:00");
                setEndTime("10:00");
            } else {
                console.error("[AdvanceSchedule] API error response:", data);
                toast.error(
                    data.error || data.detail || "Failed to schedule meeting.",
                );
            }
        } catch (error) {
            console.error("[AdvanceSchedule] Network/fetch error:", error);
            toast.error("Scheduling failed. Network error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
                className="
   
    w-[981px]
    max-w-[95vw]

    h-[953.19px]
    max-h-[90vh]

    rounded-[20px]

    border
    border-gray-200
    

    pt-[32px]
    pr-[32px]
    pb-[48px]
    pl-[32px]

    gap-[32px]

    bg-[#f7f7f7]

    opacity-100

    overflow-hidden

    shadow-2xl

    flex
    flex-col

    [&>button]:top-6
    [&>button]:right-6
    [&>button]:w-[24px]
    [&>button]:h-[24px]
    [&>button]:rounded-5px]
    [&>button]:border
    [&>button]:border-gray-400
    [&>button]:text-gray-700
  "
            >
                {/* HEADER */}

                <div
                    className="
    w-[915px]
    h-[44px]

    flex
    items-center
    justify-space-between

    opacity-100
    rotate-0

    mx-auto
  "
                >
                    <div
                        className="
              bg-blue-100
              p-3
              rounded-2xl
              shrink-0
            "
                    >
                        <Calendar
                            className="
                w-[24px]
                h-[24px]

                text-[#0b2a7a]
              "
                        />
                    </div>

                    <div
                        className="
    w-fit
    h-[44px]

    opacity-100
    rotate-0
  "
                    >
                        <h1
                            className="
      text-[20px]
      w-[272.7px]
      h-[28px]

      font-bold

      text-[#0f172a]

      whitespace-nowrap

      leading-[44px]
      pl-2
      -mt-2
    "
                        >
                            Schedule Advanced Session
                        </h1>

                        <p
                            className="
      text-[12px]
      w-[272.7px]
      h-[16px]

      text-gray-500

      mt-1
      pl-3
      
    "
                        >
                            Set up complex recurring meetings
                        </p>
                    </div>
                </div>

                {/* BODY */}

                <div
                    className="
    w-[915px]
max-w-full

h-[795.19px]

    gap-[24px]

    opacity-100
    rotate-0

    overflow-y-auto

    mx-auto

    flex
    flex-col

    px-5
    md:px-3
    pt-0
    pb-0  
    
  "
                >
                    <div
                        className="
              grid

              grid-cols-1
              lg:grid-cols-2

              gap-8
            "
                    >
                        {/* LEFT SECTION */}

                        <div className="space-y-5">
                            {/* TITLE */}

                            <div className="space-y-2 ">
                                <label
                                    className="
                    text-[12px]
                    md:text-sm

                    tracking-[2px]

                    font-semibold

                    text-gray-500

                    uppercase
                    mb-2
                    block
                    
                    
                    
                  "
                                >
                                    Meeting Title
                                </label>

                                <Input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. Design Sync"
                                    className="
                    h-12

                    rounded-xl

                    bg-[#eef2f7]

                    border
                    border-gray-200

                    text-base

                    px-4
                    
                    
                    
                  "
                                />
                                {errors.title && (
                                    <p className="text-xs text-red-500 mt-1 font-semibold">
                                        {errors.title}
                                    </p>
                                )}
                            </div>

                            {/* DESCRIPTION */}

                            <div className="space-y-2">
                                <label
                                    className="
                    text-xs
                    md:text-sm

                    tracking-[2px]

                    font-semibold

                    text-gray-500

                    uppercase
                    mb-2
                    block
                  "
                                >
                                    Description
                                </label>

                                <textarea
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    placeholder="Enter meeting description"
                                    className="
                    w-full

                    rounded-xl

                    bg-[#eef2f7]

                    border
                    border-gray-200

                    px-4
                    py-3

                    text-base

                    resize-none

                    h-[120px]
                  "
                                />
                            </div>

                            {/* START DATE */}

                            <div className="space-y-2">
                                <label
                                    className="
      text-xs
      md:text-sm
      tracking-[2px]
      font-semibold
      text-gray-500
      uppercase
      mb-2
      block
    "
                                >
                                    Start Date
                                </label>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full h-12 rounded-xl bg-[#eef2f7] hover:bg-[#eef2f7] border border-gray-200 text-base px-4 justify-start text-left font-normal hover:text-[#0f172a] text-[#0f172a]",
                                                !startDate && "text-gray-500"
                                            )}
                                        >
                                            <Calendar className="mr-2 h-4 w-4 text-[#0b2a7a]" />
                                            {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 z-[100]" align="start">
                                        <CalendarComponent
                                            mode="single"
                                            selected={startDate}
                                            onSelect={setStartDate}
                                            initialFocus
                                            disabled={(date) => {
                                                const today = new Date();
                                                today.setHours(0, 0, 0, 0); // normalize time
                                                return date < today; // disable past dates
                                            }}
                                        />
                                    </PopoverContent>
                                </Popover>
                                {errors.startDate && (
                                    <p className="text-xs text-red-500 mt-1 font-semibold">
                                        {errors.startDate}
                                    </p>
                                )}
                            </div>

                            {/* TIME */}

                            <div
                                className="
                  flex

                  flex-col
                  sm:flex-row

                  gap-4
                "
                            >
                                <div className="flex-1 space-y-2">
                                    <label
                                        className="
                      text-xs
                      md:text-sm

                      tracking-[2px]

                      font-semibold

                      text-gray-500

                      uppercase
                      mb-2
                    block
                    "
                                    >
                                        Start Time
                                    </label>

                                    <Input
                                        type="time"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        disabled={allDay}
                                        min={isTodaySelected() ? currentTime : undefined}
                                        className="
                      h-12

                      rounded-xl

                      bg-[#eef2f7]

                      border
                      border-gray-200

                      text-base

                      px-4
                    "
                                    />
                                    {errors.startTime && (
                                        <p className="text-xs text-red-500 mt-1 font-semibold">
                                            {errors.startTime}
                                        </p>
                                    )}
                                </div>

                                {!allDay && (
                                    <div className="flex-1 space-y-2">
                                        <label
                                            className="
                        text-xs
                        md:text-sm

                        tracking-[2px]

                        font-semibold

                        text-gray-500

                        uppercase
                        mb-2
                      block
                      "
                                        >
                                            End Time
                                        </label>

                                        <Input
                                            type="time"
                                            value={endTime}
                                            onChange={(e) => setEndTime(e.target.value)}
                                            min={
                                                isTodaySelected()
                                                    ? startTime > currentTime
                                                        ? startTime
                                                        : currentTime
                                                    : undefined
                                            }
                                            className="
                        h-12

                        rounded-xl

                        bg-[#eef2f7]

                        border
                        border-gray-200

                        text-base

                        px-4
                      "
                                        />
                                        {errors.endTime && (
                                            <p className="text-xs text-red-500 mt-1 font-semibold">
                                                {errors.endTime}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ALL DAY CHECKBOX */}

                            <div className="flex items-center gap-2 -mt-3">
                                <input
                                    type="checkbox"
                                    checked={allDay}
                                    onChange={() => setAllDay(!allDay)}
                                    className="
                   
                    w-4
                    h-4

                    accent-[#0b2a7a]
                  "
                                />

                                <label className="text-sm text-gray-700">
                                    All Day
                                </label>
                            </div>

                            {/* RECURRENCE */}

                            <div className="space-y-3">
                                <label
                                    className="
                    text-xs
                    md:text-sm

                    tracking-[2px]

                    font-semibold

                    text-gray-500

                    uppercase
                    mb-2
                    block
                  "
                                >
                                    Recurrence
                                </label>

                                <Select
                                    value={recurrenceType}
                                    onValueChange={setRecurrenceType}
                                >
                                    <SelectTrigger className="h-12 w-full rounded-xl bg-[#eef2f7] border border-gray-200 px-4 text-base outline-none text-[#0f172a] focus:ring-2 focus:ring-blue-100">
                                        <SelectValue placeholder="Select Recurrence" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Never">Never</SelectItem>
                                        <SelectItem value="Every Day">Every Day</SelectItem>
                                        <SelectItem value="Every Weekday (Mon-Fri)">Every Weekday (Mon-Fri)</SelectItem>
                                        <SelectItem value="Every Week">Every Week</SelectItem>
                                        <SelectItem value="Every Month">Every Month</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {recurrenceType !== "Never" && (
                                <>
                                    {/* DAYS */}

                                    <div className="space-y-3">
                                        <label
                                            className="
                        text-xs
                        md:text-sm

                        tracking-[2px]

                        font-semibold

                        text-gray-500

                        uppercase
                        mb-2
                        block
                      "
                                        >
                                            Repeat On Days
                                        </label>

                                        <div
                                            className="
                        flex
                        gap-2
                        flex-wrap
                      "
                                        >
                                            {WEEKDAYS.map((day, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => toggleDay(i)}
                                                    className={`
                            w-10
                            h-10

                            rounded-xl

                            text-sm
                            font-semibold

                            transition-all

                            ${selectedDays.includes(i)
                                                            ? "bg-[#0b2a7a] text-white"
                                                            : "bg-white border border-gray-300 text-gray-500"
                                                        }
                          `}
                                                >
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* END RECURRENCE AFTER */}
                                    <div className="mt-8">
                                        <label
                                            className="
                        block
                        text-[14px]
                        font-semibold
                        tracking-[2px]
                        uppercase
                        text-[#64748b]
                        mb-2
                      "
                                        >
                                            End Recurrence After
                                        </label>

                                        <div className="flex items-center gap-3">
                                            {/* Number Box */}
                                            <input
                                                type="number"
                                                defaultValue={10}
                                                className="
                          w-[96px]
                          h-[42px]
                          rounded-[12px]
                          border
                          border-[#d9e0ea]
                          bg-[#eef2f6]
                          px-4
                          text-[16px]
                          text-[#0f172a]
                          outline-none
                        "
                                            />

                                            {/* Dropdown */}
                                            <Select defaultValue="Weeks">
                                                <SelectTrigger className="w-[110px] h-[42px] rounded-[12px] border border-[#d9e0ea] bg-[#eef2f6] px-3 text-[16px] text-[#0f172a] outline-none">
                                                    <SelectValue placeholder="Weeks" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Weeks">Weeks</SelectItem>
                                                    <SelectItem value="Days">Days</SelectItem>
                                                    <SelectItem value="Months">Months</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            {/* Text */}
                                            <span className="text-[16px] text-[#64748b]">
                                                occurrences
                                            </span>
                                        </div>

                                        {/* Never Checkbox */}
                                        <div className="flex items-center gap-2 mt-3">
                                            <input
                                                type="checkbox"
                                                checked={neverEnds}
                                                onChange={() =>
                                                    setNeverEnds(!neverEnds)
                                                }
                                                className="w-5 h-5 rounded border-[#cbd5e1]"
                                            />

                                            <span className="text-[16px] text-[#64748b]">
                                                Never
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* BUTTONS */}

                            <div
                                className="
                  flex

                  flex-col
                  sm:flex-row

                  gap-4

                  pt-4
                "
                            >
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setOpen(false);
                                        onCancelSession();
                                    }}
                                    className="
                    h-12

                    w-full
                    sm:w-[150px]

                    rounded-xl

                    text-base

                    bg-white
                  "
                                >
                                    Cancel
                                </Button>

                                <Button
                                    onClick={handleScheduleMeeting}
                                    disabled={loading}
                                    className="
                    bg-[#002266]
                    hover:bg-[#09205e]

                    text-white

                    h-12

                    w-full
                    sm:w-[190px]

                    rounded-xl

                    text-base
                  "
                                >
                                    {loading ? "Scheduling..." : "Schedule Now"}
                                </Button>
                            </div>

                            {meetingLink && (
                                <div
                                    className="
                      mt-6

                      bg-green-50

                      border
                      border-green-200

                      rounded-2xl

                      p-4
                    "
                                >
                                    <p
                                        className="
                        text-sm
                        text-gray-500
                      "
                                    >
                                        Meeting Link
                                    </p>

                                    <a
                                        href={meetingLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="
                        text-[#0b2a7a]
                        font-semibold
                        break-all
                      "
                                    >
                                        {meetingLink}
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* RIGHT SECTION */}

                        <div className="space-y-5">
                            {/* INVITE */}
                            <div className="space-y-2">
                                <label className="text-xs md:text-sm tracking-[2px] font-bold text-gray-505 text-gray-500 uppercase mb-2 block">
                                    Add People To Invite
                                </label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            list="available-users-list"
                                            placeholder="Invite emails (separated by commas)..."
                                            className="w-full h-12 rounded-xl bg-[#eef2f7] border border-gray-200 text-base px-4 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all duration-200 text-[#0f172a]"
                                        />
                                        <datalist id="available-users-list">
                                            {availableUsers.map((u, i) => (
                                                <option key={i} value={u.email}>
                                                    {u.name || u.username} ({u.email})
                                                </option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={handleAddAttendee}
                                        className="h-12 bg-[#0b2a7a] hover:bg-[#081e59] text-white px-5 rounded-xl font-semibold cursor-pointer transition-all active:scale-95 shadow-sm"
                                    >
                                        Add
                                    </Button>
                                </div>
                                {attendeeError && (
                                    <p className="text-xs text-red-500 mt-1 font-medium">
                                        {attendeeError}
                                    </p>
                                )}
                            </div>

                            {/* ATTENDEE LIST */}
                            <div className="border border-gray-100 rounded-2xl overflow-y-auto max-h-[300px] bg-white divide-y divide-gray-100 shadow-inner">
                                {attendeesList.map((attendee, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`https://i.pravatar.cc/100?u=${attendee.email}`}
                                                alt=""
                                                className="w-10 h-10 rounded-full border border-gray-250 border-gray-200 object-cover"
                                            />
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-800">
                                                    {attendee.name}
                                                </h3>
                                                <p className="text-gray-400 text-xs">
                                                    {attendee.email}
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleRemoveAttendee(
                                                    attendee.email,
                                                )
                                            }
                                            className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                            title="Remove attendee"
                                        >
                                            <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

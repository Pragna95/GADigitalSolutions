import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";

function LoginAuth() {
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token) {
            navigate("/dashboard");
        }
    }, [navigate]);

    const [usernameOrEmail, setUsernameOrEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [rememberMe, setRememberMe] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        try {
            const response = await api.post("/api/auth/login/", {
                email: usernameOrEmail, // Mapped to usernameOrEmail field
                password: password,
            });
            console.log("LOGIN RESPONSE:", response.data);

            if (response.data.token) {
                localStorage.setItem("token", response.data.token);
                localStorage.setItem("user_id", response.data.user_id || "");
                localStorage.setItem("email", response.data.email || "");
                localStorage.setItem("username", response.data.username || "");
                localStorage.setItem("name", response.data.name || "");
                if (rememberMe) {
                    localStorage.setItem("remember_me", "true");
                }

                // Check if there is a pending meeting deep link in sessionStorage
                const pendingMeetingStr = sessionStorage.getItem("pending_meeting");
                if (pendingMeetingStr) {
                    sessionStorage.removeItem("pending_meeting");

                    let pending = pendingMeetingStr;

                    try {
                        pending = JSON.parse(pendingMeetingStr);
                    } catch (e) { }

                    if (typeof pending === "string") {
                        sessionStorage.setItem("meeting_authenticated", "true");

                        const destination = pending.startsWith("/")
                            ? pending
                            : `/${pending}`;

                        navigate(destination);
                        return;
                    }

                    sessionStorage.setItem("meeting_authenticated", "true");

                    const { meeting_id } = pending;

                    navigate(`/lobby/${meeting_id}`);
                    return;
                }

                const redirectPath =
                    sessionStorage.getItem("redirect_after_login");

                if (redirectPath) {
                    sessionStorage.removeItem("redirect_after_login");
                    navigate(redirectPath);
                } else {
                    navigate("/dashboard");
                }
            }
        } catch (err) {
            if (err.response && err.response.data) {
                setError(
                    err.response.data.detail ||
                    err.response.data.message ||
                    "Invalid email/username or password.",
                );
            } else {
                setError("Could not connect to Auth Services backend.");
            }
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <span className="text-3xl font-extrabold tracking-tight text-indigo-600">
                        Huddle
                    </span>
                </div>
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
                    Sign in to your account
                </h2>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-xl shadow-slate-100 border border-slate-100 sm:rounded-2xl sm:px-10">
                    {/* Error Alert */}
                    {error && (
                        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-100">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg
                                        className="h-5 w-5 text-red-400"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">
                                        Authentication Error
                                    </h3>
                                    <div className="mt-2 text-sm text-red-700">
                                        <p>{error}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label
                                htmlFor="username"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Email or Username
                            </label>
                            <div className="mt-1">
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    value={usernameOrEmail}
                                    onChange={(e) =>
                                        setUsernameOrEmail(e.target.value)
                                    }
                                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Password
                                </label>
                                <div className="text-sm">
                                    <span className="cursor-pointer font-medium text-indigo-600 hover:text-indigo-500 transition duration-150 ease-in-out">
                                        Forgot password?
                                    </span>
                                </div>
                            </div>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input
                                    id="remember_me"
                                    name="remember_me"
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) =>
                                        setRememberMe(e.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition duration-150 ease-in-out"
                                />
                                <label
                                    htmlFor="remember_me"
                                    className="ml-2 block text-sm text-slate-900"
                                >
                                    Remember me
                                </label>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition duration-150 ease-in-out"
                            >
                                Sign in
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-slate-500">
                            Don't have an account?{" "}
                            <Link
                                to="/signup"
                                className="font-semibold text-indigo-600 hover:text-indigo-500 transition duration-150 ease-in-out"
                            >
                                Sign up
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoginAuth;

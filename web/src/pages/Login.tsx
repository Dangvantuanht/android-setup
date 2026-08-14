import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const REMEMBERED_EMAIL_KEY = "autosetup_remembered_email";

export function Login() {
  const { email: authedEmail, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authedEmail) navigate("/", { replace: true });
  }, [authedEmail, navigate]);

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  function persistRememberedEmail(e: string, remember: boolean) {
    if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, e);
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password, rememberMe);
      persistRememberedEmail(email, rememberMe);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await api.register(email, password);
      setInfo("Đăng ký thành công. Tài khoản đang chờ admin duyệt trước khi đăng nhập được.");
      setMode("login");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={mode === "login" ? onLogin : onRegister}>
        <h1>{mode === "login" ? "Đăng nhập" : "Đăng ký tài khoản"}</h1>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Mật khẩu
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
          />
        </label>
        {mode === "login" && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Ghi nhớ đăng nhập
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button type="submit" disabled={submitting}>
          {submitting
            ? "Đang xử lý..."
            : mode === "login"
              ? "Đăng nhập"
              : "Đăng ký"}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

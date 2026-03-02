import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="p-4 border-b flex gap-4">
      <Link href="/">Home</Link>
      <Link href="/communities">Communities</Link>
      <Link href="/vent">Vent</Link>
      <Link href="/login">Login</Link>
    </nav>
  );
}

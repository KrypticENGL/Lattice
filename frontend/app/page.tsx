export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-100">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Data Structure Visualizer
      </h1>
      <p className="max-w-md text-sm leading-6 text-zinc-400">
        Next.js frontend · Rust + Tokio + Axum backend. Start building here.
      </p>
    </main>
  );
}

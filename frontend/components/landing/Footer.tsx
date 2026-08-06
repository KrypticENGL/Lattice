export default function Footer() {
  return (
    <footer className="border-t border-gruvbg-3 bg-gruvbg px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] font-semibold text-gruvfg">
            Lattice
          </span>
          <span className="text-[13px] text-gruvfg-4">
            — trace first, visualize second.
          </span>
        </div>
        <div className="flex items-center gap-6 text-[13px] text-gruvfg-3">
          <a href="#how-it-works" className="hover:text-gruv-aqua">
            How it works
          </a>
          <a href="#features" className="hover:text-gruv-aqua">
            Features
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gruv-aqua"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

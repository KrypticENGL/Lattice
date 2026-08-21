import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Features from "@/components/landing/Features";
import CodeShowcase from "@/components/landing/CodeShowcase";
import Technologies from "@/components/landing/Technologies";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";
import ScrollFrame from "@/components/landing/ScrollFrame";

export default function Home() {
  return (
    <div className="grain-bg viewport-shell relative flex flex-col gap-4 p-4 sm:gap-8 sm:p-12">
      <div className="shrink-0">
        <Navbar />
      </div>

      <div className="min-h-0 flex-1">
        <div className="h-full overflow-hidden rounded-[20px] sm:rounded-[28px]">
          <ScrollFrame>
            <div className="snap-panel">
              <Hero />
            </div>
            <div className="snap-panel">
              <HowItWorks />
            </div>
            <div className="snap-panel">
              <Features />
            </div>
            <div className="snap-panel">
              <CodeShowcase />
            </div>
            <div className="snap-panel">
              <Technologies />
            </div>
            <div className="snap-panel flex flex-col">
              <div className="flex flex-1 items-center justify-center">
                <CTA />
              </div>
              <Footer />
            </div>
          </ScrollFrame>
        </div>
      </div>
    </div>
  );
}

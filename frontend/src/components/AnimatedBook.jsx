import { motion } from "framer-motion";

export const LEARN = [
  "100+ frequently asked SOC interview questions with detailed, real-time answers",
  "Practical case studies and real-world scenarios from live SOC environments",
  "In-depth analysis and investigation workflows using Splunk SIEM",
  "Malware investigation techniques and how to respond to common threats",
  "Web application attacks and hands-on analysis using OWASP principles",
  "Step-by-step breakdowns of phishing investigations with real email samples",
  "Understanding and applying threat intelligence in a SOC setting",
  "Introduction to threat hunting methodologies and common tools",
  "Real-world incident response workflows",
  "Vulnerability Management using Qualys, with real use cases",
];

export const AUDIENCE = [
  "Aspiring SOC Analysts (L1, L2, or L3)",
  "IT professionals transitioning into cybersecurity",
  "Cybersecurity students preparing for interviews",
  "Anyone wanting practical exposure to real SOC scenarios",
];

export const UDEMY_URL = "https://www.udemy.com/course/soc-interview-preparation-100questions-from-top-interviews/?referralCode=EB7475E7369B8DD58A38";

export default function AnimatedBook({ size = "md" }) {
  const w = size === "lg" ? "w-64 sm:w-80" : "w-56 sm:w-64";
  return (
    <div className="relative [perspective:1400px] grid place-items-center py-6" data-testid="animated-book">
      <motion.div className="absolute h-[70%] w-[70%] rounded-full bg-orange-500/20 blur-3xl" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4, repeat: Infinity }} />
      <motion.div className={`relative ${w} aspect-[641/910] isolate`}
        initial={{ rotateY: -70, opacity: 0 }} animate={{ rotateY: [-24, -14, -24], y: [0, -12, 0], opacity: 1 }}
        transition={{ rotateY: { duration: 6, repeat: Infinity, ease: "easeInOut" }, y: { duration: 6, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.8 } }}>
        {[1, 2, 3].map((i) => (
          <div key={i} aria-hidden className="absolute inset-0 rounded-r-md bg-[#e8e4dc] border border-black/30"
            style={{ transform: `translate(${i * 4}px, ${i * 3}px)`, zIndex: -i }} />))}
        <img src="/book/cover.jpg" alt="SOC Interview Mastery book cover by Gopi Pakanati" className="relative h-full w-full object-cover rounded-r-md shadow-[20px_25px_60px_rgba(0,0,0,.7)]" />
        <div className="absolute inset-0 rounded-r-md bg-gradient-to-r from-black/40 via-white/5 to-black/20 pointer-events-none" />
        <motion.div className="absolute inset-0 rounded-r-md pointer-events-none bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,.18)_50%,transparent_65%)] bg-[length:250%_100%]"
          animate={{ backgroundPositionX: ["120%", "-120%"] }} transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2 }} />
        <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/60 to-transparent rounded-l-sm pointer-events-none" />
      </motion.div>
    </div>
  );
}

"use client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { Separator } from "../ui/separator";
import { LogIn, UserPlus, Sparkles } from "lucide-react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

type NavbarProps = {
  loggedIn: boolean;
};

export default function Navbar({ loggedIn }: NavbarProps) {
  return (
    <nav className="sticky top-0 w-full backdrop-blur-xl bg-white/80 border-b border-gradient-to-r from-blue-200/30 to-violet-200/30 z-50 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <motion.img
              src="/tayyari_logo.svg"
              alt="Tayyari.AI"
              className="h-14 drop-shadow-sm"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.8,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{ 
                scale: 1.05,
                transition: { duration: 0.2 }
              }}
            />
          </Link>

          {/* Clerk Auth Buttons */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <SignedOut>
              {/* Sign In Button */}
              <SignInButton mode="modal">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    variant="ghost" 
                    className="relative overflow-hidden bg-gradient-to-r from-gray-50 to-blue-50 hover:from-blue-50 hover:to-violet-50 border border-blue-200/50 hover:border-violet-300/50 text-blue-700 hover:text-violet-700 px-6 py-2.5 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-md"
                  >
                    <motion.div 
                      className="flex items-center gap-2"
                      initial={{ opacity: 0.8 }}
                      whileHover={{ opacity: 1 }}
                    >
                      <LogIn className="w-4 h-4" />
                      Sign in
                    </motion.div>
                    
                    {/* Animated background glow */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/10 to-violet-400/0 opacity-0"
                      whileHover={{ 
                        opacity: 1,
                        transition: { duration: 0.3 }
                      }}
                    />
                  </Button>
                </motion.div>
              </SignInButton>

              {/* Sign Up Button */}
              <SignUpButton mode="modal">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 text-white px-8 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-violet-600/30 transition-all duration-300 border-0"
                  >
                    <motion.div 
                      className="flex items-center gap-2 relative z-10"
                      initial={{ opacity: 0.9 }}
                      whileHover={{ opacity: 1 }}
                    >
                      <UserPlus className="w-4 h-4" />
                      Get Started
                      <Sparkles className="w-4 h-4 ml-1" />
                    </motion.div>
                    
                    {/* Animated shimmer effect */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
                      animate={{
                        translateX: ["100%", "100%", "-100%", "-100%"],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        repeatType: "loop",
                        ease: "linear",
                      }}
                    />
                    
                    {/* Hover glow effect */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-violet-400/20 to-blue-400/0 opacity-0"
                      whileHover={{ 
                        opacity: 1,
                        transition: { duration: 0.3 }
                      }}
                    />
                  </Button>
                </motion.div>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              {/* User Button with enhanced styling */}
              <motion.div
                className="relative"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="p-1 rounded-full bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-200/30">
                  <UserButton 
                    afterSignOutUrl="/"
                    appearance={{
                      elements: {
                        avatarBox: "w-10 h-10 rounded-full ring-2 ring-blue-500/20 hover:ring-violet-500/30 transition-all duration-300",
                        userButtonPopoverCard: "shadow-xl border-0 bg-white/95 backdrop-blur-xl",
                        userButtonPopoverActions: "gap-2",
                        userButtonPopoverActionButton: "hover:bg-gradient-to-r hover:from-blue-50 hover:to-violet-50 transition-all duration-200 rounded-lg",
                      },
                    }}
                  />
                </div>
                
                {/* Subtle glow effect around user button */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-violet-500/0 opacity-0 -z-10"
                  whileHover={{ 
                    opacity: 1,
                    scale: 1.2,
                    transition: { duration: 0.3 }
                  }}
                />
              </motion.div>
            </SignedIn>
          </motion.div>
        </div>
      </div>

      {/* Enhanced Separator */}
      <motion.div
        className="h-px bg-gradient-to-r from-transparent via-blue-200/50 to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      />
    </nav>
  );
}
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Tayyari — Agentic AI Learning',
  description: 'Transform your learning materials into interactive, AI-powered learning experiences.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: undefined,
        variables: {
          // Brand Colors
          colorPrimary: '#4f5eff', // Your signature blue
          colorPrimaryForeground: '#ffffff',
          colorBackground: '#ffffff',
          colorInputBackground: '#f8fafc',
          colorInputText: '#1e293b',
          colorText: '#334155',
          colorTextSecondary: '#64748b',
          colorTextOnPrimaryBackground: '#ffffff',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorDanger: '#ef4444',
          colorNeutral: '#6b7280',
          
          // Typography
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '14px',
          fontWeight: {
            normal: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
          },
          
          // Layout & Spacing
          spacingUnit: '1rem',
          borderRadius: '0.75rem', // 12px - matches your design
          
          // Shadows
          shadowShimmer: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
          shadowSmall: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
          shadowMedium: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          shadowLarge: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        },
        elements: {
          // Main modal container
          modalContent: {
            background: 'radial-gradient(ellipse at 60% 20%, #e8eafe 60%, #f7e8fc 100%)',
            borderRadius: '2rem',
            border: '1px solid #e2e6fa',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            padding: '2.5rem',
            maxWidth: '28rem',
            width: '100%',
          },
          
          // Modal backdrop
          modalBackdrop: {
            backdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
          },
          
          // Header styling
          headerTitle: {
            fontSize: '2rem',
            fontWeight: '700',
            background: 'linear-gradient(135deg, #4f5eff 0%, #7a5cfa 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textAlign: 'center',
            marginBottom: '0.5rem',
            lineHeight: '1.2',
          },
          
          headerSubtitle: {
            color: '#64748b',
            fontSize: '1rem',
            textAlign: 'center',
            marginBottom: '2rem',
            lineHeight: '1.5',
          },
          
          // Social authentication buttons
          socialButtonsBlockButton: {
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            border: '1px solid #cbd5e1',
            borderRadius: '0.75rem',
            padding: '0.875rem 1.5rem',
            fontSize: '0.95rem',
            fontWeight: '500',
            color: '#334155',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            '&:hover': {
              background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          },
          
          // Form fields
          formFieldInput: {
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '0.875rem 1rem',
            fontSize: '0.95rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:focus': {
              borderColor: '#4f5eff',
              boxShadow: '0 0 0 3px rgba(79, 94, 255, 0.1)',
              backgroundColor: '#ffffff',
              outline: 'none',
            },
            '&::placeholder': {
              color: '#9ca3af',
            },
          },
          
          formFieldLabel: {
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '0.5rem',
            display: 'block',
          },
          
          // Primary action button (Continue/Sign in)
          formButtonPrimary: {
            background: 'linear-gradient(135deg, #4f5eff 0%, #7a5cfa 100%)',
            borderRadius: '0.75rem',
            padding: '0.875rem 2rem',
            fontSize: '0.95rem',
            fontWeight: '600',
            border: 'none',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(79, 94, 255, 0.39)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            width: '100%',
            '&:hover': {
              background: 'linear-gradient(135deg, #3b47db 0%, #6b46c1 100%)',
              transform: 'translateY(-1px)',
              boxShadow: '0 6px 20px rgba(79, 94, 255, 0.4)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
            '&:disabled': {
              opacity: '0.6',
              cursor: 'not-allowed',
              transform: 'none',
            },
          },
          
          // Footer action links
          footerActionLink: {
            color: '#4f5eff',
            fontWeight: '500',
            textDecoration: 'none',
            transition: 'color 0.2s ease',
            '&:hover': {
              color: '#3b47db',
              textDecoration: 'underline',
            },
          },
          
          // Divider between social and email
          dividerLine: {
            backgroundColor: '#e2e8f0',
            height: '1px',
            margin: '1.5rem 0',
          },
          
          dividerText: {
            color: '#64748b',
            fontSize: '0.875rem',
            backgroundColor: 'transparent',
            padding: '0 1rem',
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '-50px',
              right: '-50px',
              height: '1px',
              backgroundColor: '#e2e8f0',
              zIndex: '-1',
            },
          },
          
          // Error messages
          formFieldErrorText: {
            color: '#ef4444',
            fontSize: '0.8125rem',
            marginTop: '0.25rem',
            display: 'block',
          },
          
          // Success messages
          formFieldSuccessText: {
            color: '#10b981',
            fontSize: '0.8125rem',
            marginTop: '0.25rem',
            display: 'block',
          },
          
          // Card styling for sign-up/sign-in forms
          card: {
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
          },
          
          // Footer
          footer: {
            '& > div:last-child': {
              display: 'none', // Hide "Development mode" text
            },
          },
          
          // Close button
          modalCloseButton: {
            color: '#6b7280',
            '&:hover': {
              color: '#374151',
            },
          },
          
          // Loading spinner
          spinner: {
            color: '#4f5eff',
            width: '20px',
            height: '20px',
          },
          
          // Form field hints
          formFieldHintText: {
            color: '#6b7280',
            fontSize: '0.8125rem',
            marginTop: '0.25rem',
          },
          
          // Avatar in user button
          userButtonAvatarBox: {
            width: '2.5rem',
            height: '2.5rem',
            borderRadius: '50%',
            border: '2px solid rgba(79, 94, 255, 0.2)',
            transition: 'border-color 0.2s ease',
            '&:hover': {
              borderColor: 'rgba(79, 94, 255, 0.4)',
            },
          },
          
          // User button popover
          userButtonPopoverCard: {
            borderRadius: '1rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
          },
          
          // User button popover actions
          userButtonPopoverActionButton: {
            borderRadius: '0.5rem',
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            },
          },
        },
      }}
    >
      <html lang="en">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
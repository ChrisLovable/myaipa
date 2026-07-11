export default function TermsPage() {
  return (
    <div className="min-h-screen px-6 py-10" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="max-w-2xl mx-auto text-white">
        <h1 className="text-2xl font-bold mb-6">Terms of Use &amp; Privacy Notice</h1>

        <p className="text-sm mb-4" style={{ color: '#8888cc' }}>
          Last updated: 7 July 2026. This notice explains what myAIpa collects
          and how it is used, in accordance with the Protection of Personal
          Information Act (POPIA).
        </p>

        <h2 className="text-lg font-semibold mt-8 mb-3">What we collect</h2>
        <ul className="text-sm space-y-2 mb-6" style={{ color: '#cccccc' }}>
          <li>Your name, phone number, and email address, so Gabby can identify you and communicate with you.</li>
          <li>Your language preference, to determine which assistant responds to you.</li>
          <li>Your company logo, if uploaded, for use on documents Gabby generates on your behalf.</li>
          <li>If you connect Google Calendar or Contacts, we store an access token that lets Gabby read and manage calendar events and look up contact names on your behalf. We do not store your calendar or contact data itself beyond what is needed to complete a specific request.</li>
          <li>Call recordings and transcripts of your conversations with Gabby, for quality and service improvement.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-8 mb-3">How it is used</h2>
        <ul className="text-sm space-y-2 mb-6" style={{ color: '#cccccc' }}>
          <li>To let Gabby recognise you and personalise responses.</li>
          <li>To place calls and schedule reminders you have requested.</li>
          <li>To improve the quality and reliability of the service.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-8 mb-3">Your rights</h2>
        <p className="text-sm mb-6" style={{ color: '#cccccc' }}>
          You may request access to, correction of, or deletion of your
          personal information at any time by contacting us. You may also
          disconnect Google integrations at any time in Settings.
        </p>

        <p className="text-xs mt-10" style={{ color: '#555555' }}>
          This is a placeholder notice pending full legal review and is not a
          substitute for formal legal advice.
        </p>
      </div>
    </div>
  )
}

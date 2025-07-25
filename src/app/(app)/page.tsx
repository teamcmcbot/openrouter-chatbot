"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="flex flex-col items-center min-h-full">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-4 mt-4">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Chat with AI{" "}
            <span className="text-emerald-600 dark:text-emerald-400 block">
              Powered by OpenRouter
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Experience the power of advanced AI conversation. Get instant responses, 
            creative insights, and helpful assistance through our intuitive chat interface.
          </p>
        </div>

        {/* Call to Action */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-emerald-600 border border-transparent rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Start Chatting Now
            <svg 
              className="ml-2 w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 7l5 5m0 0l-5 5m5-5H6" 
              />
            </svg>
          </Link>
          <button 
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors duration-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Learn More
          </button>
        </div>

        {/* Features Grid */}
        <div id="features" className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Lightning Fast
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Get instant responses powered by cutting-edge AI technology for seamless conversations.
            </p>
          </div>

          <div className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Reliable & Secure
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Built with privacy in mind and powered by trusted OpenRouter infrastructure.
            </p>
          </div>

          <div className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Natural Conversations
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Engage in human-like conversations with advanced language understanding.
            </p>
          </div>
        </div>

        {/* User Reviews Section */}
        <div className="mt-16 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 text-center">
            What Our Users Say
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-12 text-center max-w-2xl mx-auto">
            Join thousands of satisfied users who have transformed their AI interaction experience.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Review 1 */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-4 italic">
                &quot;The response quality is incredible! It&apos;s like having a conversation with a real expert. The interface is clean and the AI understands context perfectly.&quot;
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                  S
                </div>
                <div className="ml-3">
                  <p className="font-semibold text-gray-900 dark:text-white">Sarah Chen</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Content Creator</p>
                </div>
              </div>
            </div>

            {/* Review 2 */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-4 italic">
                &quot;As a developer, I need quick and accurate answers. This chatbot delivers exactly that. The OpenRouter integration gives me access to the best AI models.&quot;
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                  M
                </div>
                <div className="ml-3">
                  <p className="font-semibold text-gray-900 dark:text-white">Marcus Rodriguez</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Software Engineer</p>
                </div>
              </div>
            </div>

            {/* Review 3 */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-4 italic">
                &quot;I use this for research and writing assistance. The AI&apos;s ability to maintain context throughout long conversations is impressive. Highly recommended!&quot;
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white font-semibold">
                  A
                </div>
                <div className="ml-3">
                  <p className="font-semibold text-gray-900 dark:text-white">Alex Thompson</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Researcher</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 text-center">
            <div className="flex flex-wrap justify-center items-center gap-8 text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">50,000+ Active Users</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">99.9% Uptime</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">Enterprise Grade Security</span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional CTA */}
        <div className="mt-12 p-6 bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-2xl mx-auto">
            Join thousands of users who are already experiencing the future of AI conversation.
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-emerald-600 border border-transparent rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors duration-200"
          >
            Try it now - it&apos;s free!
          </Link>
        </div>
      </div>
    </div>
    </div>
  );
}

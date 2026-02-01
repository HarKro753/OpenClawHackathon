//
//  IntegrationsView.swift
//  OpenClawApp
//

import SwiftUI
import UIKit
import WebKit

enum IntegrationType {
    case google
    case linkedin
    case notion
    case github
}

struct IntegrationsView: View {
    @Environment(\.integrationsManager) private var integrationsManager: IntegrationsManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    let onContinue: () -> Void

    @State private var showBrowser = false
    @State private var browserURL: URL?
    @State private var currentIntegration: IntegrationType?
    @State private var showNotionAPIKeyAlert = false
    @State private var notionAPIKeyInput = ""

    private let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16)
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 16) {
                        // Google - opens in external Safari browser
                        IntegrationButton(
                            icon: "google.gmail",
                            name: "Google",
                            isConnected: integrationsManager.status?.google.connected == true
                        ) {
                            if let url = URL(string: "http://192.168.178.141:3001/api/auth/google/start") {
                                openURL(url)
                            }
                            // Polling will automatically detect when connected
                        }

                        // LinkedIn - opens in Safari View Controller
                        IntegrationButton(
                            icon: "linkedin",
                            name: "LinkedIn",
                            isConnected: integrationsManager.status?.linkedin.connected == true
                        ) {
                            currentIntegration = .linkedin
                            browserURL = URL(string: "https://www.linkedin.com/login")
                            showBrowser = true
                        }

                        // Notion - opens external browser to create integration, then shows API key alert
                        IntegrationButton(
                            icon: "notion",
                            name: "Notion",
                            isConnected: integrationsManager.status?.notion.connected == true
                        ) {
                            // Show API key alert directly - polling will detect when saved
                            showNotionAPIKeyAlert = true
                        }

                        // Telegram (placeholder for now)
                        IntegrationButton(
                            icon: "github",
                            name: "Telegram",
                            isConnected: integrationsManager.status?.telegram?.connected == true
                        ) {
                            // Not implemented yet
                        }
                    }
                    .padding(20)
                }
                .background(Color(.systemGroupedBackground))
                
                // Continue button at bottom
                VStack(spacing: 0) {
                    Divider()
                    Button(action: onContinue) {
                        Text("Continue")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color(.label))
                            )
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 16)
                }
                .background(Color(.systemBackground))
            }
            .navigationTitle("Integrations")
            .sheet(isPresented: $showBrowser, onDismiss: handleBrowserDismiss) {
                if let url = browserURL, let integration = currentIntegration {
                    InAppBrowserView(
                        url: url,
                        integration: integration,
                        onComplete: handleBrowserComplete
                    )
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                }
            }
            .alert("Enter Notion API Key", isPresented: $showNotionAPIKeyAlert) {
                TextField("API Key", text: $notionAPIKeyInput)
                    .textContentType(.password)
                Button("Cancel", role: .cancel) {
                    notionAPIKeyInput = ""
                }
                Button("Save") {
                    saveNotionKey()
                }
            } message: {
                Text("Create an integration in Notion Settings and paste the Internal Integration Secret here.")
            }
            .task {
                // Start polling when view appears
                integrationsManager.startPolling()
            }
            .onDisappear {
                // Stop polling when view disappears
                integrationsManager.stopPolling()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                // Resume polling when app comes to foreground
                integrationsManager.startPolling()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
                // Pause polling when app goes to background
                integrationsManager.stopPolling()
            }
        }
    }

    private func handleBrowserDismiss() {
        // Reset state
    }

    private func handleBrowserComplete(_ integration: IntegrationType, _ cookies: [String: String]?) {
        switch integration {
        case .linkedin:
            if let cookies = cookies,
               let liAt = cookies["liAt"],
               let jsessionId = cookies["jsessionId"] {
                integrationsManager.linkedinLiAt = liAt
                integrationsManager.linkedinJsessionId = jsessionId
                Task {
                    await integrationsManager.saveLinkedinCookies()
                }
            }
        case .google, .notion, .github:
            break
        }
    }

    private func saveNotionKey() {
        let trimmed = notionAPIKeyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            notionAPIKeyInput = ""
            return
        }
        integrationsManager.notionKey = trimmed
        Task {
            await integrationsManager.saveNotionKey()
        }
        notionAPIKeyInput = ""
    }
}

// MARK: - Integration Button

private struct IntegrationButton: View {
    let icon: String
    let name: String
    let isConnected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(icon)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 48, height: 48)

                Text(name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(alignment: .topTrailing) {
                if isConnected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.green)
                        .background(
                            Circle()
                                .fill(Color(.secondarySystemGroupedBackground))
                                .frame(width: 20, height: 20)
                        )
                        .offset(x: -8, y: 8)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - In-App Browser View (using WKWebView with Cookie Capture)

struct InAppBrowserView: View {
    let url: URL
    let integration: IntegrationType
    let onComplete: (IntegrationType, [String: String]?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var pageTitle = ""

    var body: some View {
        NavigationStack {
            ZStack {
                LinkedInWebView(
                    url: url,
                    isLoading: $isLoading,
                    loadError: $loadError,
                    pageTitle: $pageTitle,
                    onCookiesCaptured: { cookies in
                        onComplete(integration, cookies)
                        dismiss()
                    }
                )
                .ignoresSafeArea(edges: .bottom)
                
                if isLoading {
                    ProgressView("Loading...")
                        .padding()
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
                
                if let error = loadError {
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)
                        Text("Failed to Load")
                            .font(.headline)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                }
            }
            .navigationTitle(pageTitle.isEmpty ? "LinkedIn" : pageTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - WKWebView Wrapper with Cookie Capture

struct LinkedInWebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var loadError: String?
    @Binding var pageTitle: String
    let onCookiesCaptured: ([String: String]) -> Void
    
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        
        // Use default data store for cookie persistence
        configuration.websiteDataStore = .default()
        
        // Set preferences
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences
        
        // Process pool - use a shared one to help with networking
        configuration.processPool = WKProcessPool()
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        
        // Use iOS Safari mobile user agent (more compatible with LinkedIn mobile)
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        
        // Load the URL with cache policy that bypasses proxy issues
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        webView.load(request)
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(
            isLoading: $isLoading,
            loadError: $loadError,
            pageTitle: $pageTitle,
            onCookiesCaptured: onCookiesCaptured
        )
    }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var isLoading: Bool
        @Binding var loadError: String?
        @Binding var pageTitle: String
        let onCookiesCaptured: ([String: String]) -> Void
        
        init(
            isLoading: Binding<Bool>,
            loadError: Binding<String?>,
            pageTitle: Binding<String>,
            onCookiesCaptured: @escaping ([String: String]) -> Void
        ) {
            _isLoading = isLoading
            _loadError = loadError
            _pageTitle = pageTitle
            self.onCookiesCaptured = onCookiesCaptured
        }
        
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.isLoading = true
                self.loadError = nil
            }
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.isLoading = false
                self.pageTitle = webView.title ?? ""
            }
            
            // Check cookies after each page load
            checkForLinkedInCookies(webView: webView)
        }
        
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleError(error)
        }
        
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handleError(error)
        }
        
        private func handleError(_ error: Error) {
            DispatchQueue.main.async {
                self.isLoading = false
                // Ignore cancellation errors (user navigated away)
                if (error as NSError).code != NSURLErrorCancelled {
                    self.loadError = error.localizedDescription
                }
            }
        }
        
        private func checkForLinkedInCookies(webView: WKWebView) {
            let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
            
            cookieStore.getAllCookies { [weak self] cookies in
                var liAt: String?
                var jsessionId: String?
                
                for cookie in cookies {
                    // LinkedIn session cookies
                    if cookie.domain.contains("linkedin.com") {
                        if cookie.name == "li_at" {
                            liAt = cookie.value
                            print("[LinkedIn] Captured li_at cookie")
                        } else if cookie.name == "JSESSIONID" {
                            // JSESSIONID often has quotes around it
                            jsessionId = cookie.value.replacingOccurrences(of: "\"", with: "")
                            print("[LinkedIn] Captured JSESSIONID cookie")
                        }
                    }
                }
                
                // If we have both cookies, the user is logged in!
                if let liAt = liAt, let jsessionId = jsessionId {
                    print("[LinkedIn] User is logged in! Sending cookies back.")
                    DispatchQueue.main.async {
                        self?.onCookiesCaptured([
                            "liAt": liAt,
                            "jsessionId": jsessionId
                        ])
                    }
                }
            }
        }
    }
}



#Preview {
    IntegrationsView(onContinue: {})
        .environment(IntegrationsManager())
}

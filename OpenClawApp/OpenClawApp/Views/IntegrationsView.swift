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
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    // Google - opens in external Safari browser
                    IntegrationButton(
                        icon: "google.gmail",
                        name: "Google",
                        isConnected: integrationsManager.status?.gog.connected == true
                    ) {
                        if let url = URL(string: "http://localhost:3001/api/auth/google/start") {
                            openURL(url)
                        }
                        // Refresh status after a delay to check if connected
                        Task {
                            try? await Task.sleep(for: .seconds(3))
                            await integrationsManager.fetchStatus()
                        }
                    }

                    // LinkedIn
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
                        if let url = URL(string: "https://www.notion.so/profile/integrations") {
                            openURL(url)
                        }
                        // Show API key alert after a short delay
                        Task {
                            try? await Task.sleep(for: .seconds(1))
                            showNotionAPIKeyAlert = true
                        }
                    }

                    // GitHub (placeholder for now)
                    IntegrationButton(
                        icon: "github",
                        name: "GitHub",
                        isConnected: integrationsManager.status?.github?.connected == true
                    ) {
                        // Not implemented yet
                    }
                }
                .padding(20)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Integrations")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .fullScreenCover(isPresented: $showBrowser, onDismiss: handleBrowserDismiss) {
                if let url = browserURL, let integration = currentIntegration {
                    InAppBrowserView(
                        url: url,
                        integration: integration,
                        onComplete: handleBrowserComplete
                    )
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
                await integrationsManager.fetchStatus()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                Task {
                    await integrationsManager.fetchStatus()
                }
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

// MARK: - In-App Browser View

struct InAppBrowserView: View {
    let url: URL
    let integration: IntegrationType
    let onComplete: (IntegrationType, [String: String]?) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebView(url: url, integration: integration, onComplete: { cookies in
                onComplete(integration, cookies)
                dismiss()
            })
            .navigationTitle(integrationTitle)
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

    private var integrationTitle: String {
        switch integration {
        case .google: return "Google"
        case .linkedin: return "LinkedIn"
        case .notion: return "Notion"
        case .github: return "GitHub"
        }
    }
}

// MARK: - WebView

struct WebView: UIViewRepresentable {
    let url: URL
    let integration: IntegrationType
    let onComplete: ([String: String]?) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        
        // Allow JavaScript and inline media playback
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        
        // Set a desktop-like user agent to avoid mobile restrictions
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(integration: integration, onComplete: onComplete)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        let integration: IntegrationType
        let onComplete: ([String: String]?) -> Void

        init(integration: IntegrationType, onComplete: @escaping ([String: String]?) -> Void) {
            self.integration = integration
            self.onComplete = onComplete
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let url = webView.url else { return }

            switch integration {
            case .linkedin:
                // LinkedIn redirects to feed after successful login
                if url.host == "www.linkedin.com" && (url.path == "/feed" || url.path == "/feed/") {
                    extractLinkedInCookies(from: webView)
                }
            default:
                break
            }
        }

        private func extractLinkedInCookies(from webView: WKWebView) {
            let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
            cookieStore.getAllCookies { cookies in
                var result: [String: String] = [:]
                for cookie in cookies {
                    if cookie.domain.contains("linkedin.com") {
                        if cookie.name == "li_at" {
                            result["liAt"] = cookie.value
                        } else if cookie.name == "JSESSIONID" {
                            result["jsessionId"] = cookie.value.replacingOccurrences(of: "\"", with: "")
                        }
                    }
                }

                if !result.isEmpty {
                    self.onComplete(result)
                }
            }
        }
    }
}

#Preview {
    IntegrationsView()
        .environment(IntegrationsManager())
}

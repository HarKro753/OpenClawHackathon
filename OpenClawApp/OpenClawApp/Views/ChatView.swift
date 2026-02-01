//
//  ChatView.swift
//  OpenClawApp
//

import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Known SF Symbols
// Icons that are SF Symbols (not custom assets)
private let sfSymbolIcons: Set<String> = ["safari", "terminal", "gearshape"]

struct ChatView: View {
    @Environment(\.chatManager) private var chatManager: ChatManager

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                @Bindable var chatManager = chatManager
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(chatManager.messages) { message in
                            ChatBubble(message: message)
                        }
                        if chatManager.isLoading {
                            HStack {
                                Text("Thinking...")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                                            .fill(Color(.secondarySystemBackground))
                                    )
                                Spacer(minLength: 30)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                }
                .onTapGesture {
                    hideKeyboard()
                }

                VStack(spacing: 0) {
                    Divider()

                    HStack(spacing: 12) {
                        TextField("Message OpenClaw", text: $chatManager.input)
                            .textFieldStyle(.plain)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Color(.secondarySystemBackground))
                            )

                        Button {
                            chatManager.send()
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(Color(.label))
                        }
                        .disabled(chatManager.isLoading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(Color(.systemBackground))
            }
            .navigationTitle("OpenClaw")
        }
    }
}

// MARK: - Chat Bubble

private struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .assistant || message.role == .tool {
                bubble
                Spacer(minLength: 30)
            } else {
                Spacer(minLength: 30)
                bubble
            }
        }
    }

    @ViewBuilder
    private var bubble: some View {
        if message.role == .tool {
            ToolCallRow(message: message)
        } else {
            Text(message.content)
                .font(.body)
                .foregroundStyle(message.role == .assistant ? Color(.label) : Color(.white))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(message.role == .assistant ? Color(.secondarySystemBackground) : Color(.label))
                )
                .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 4)
                .frame(maxWidth: 320, alignment: message.role == .assistant ? .leading : .trailing)
        }
    }
}

// MARK: - Tool Call Row (Compact, Single-Line)

private struct ToolCallRow: View {
    let message: ChatMessage
    @Environment(\.openURL) private var openURL

    private var isComplete: Bool {
        message.toolSuccess != nil
    }

    private var hasUrl: Bool {
        message.toolUrl != nil
    }

    var body: some View {
        HStack(spacing: 10) {
            // Status indicator: spinner while in progress, checkmark/x when done
            statusIndicator

            // Service icon (SF Symbol or custom asset from server)
            toolIcon
                .frame(width: 20, height: 20)
                .foregroundStyle(.secondary)

            // Label text from server
            Text(message.toolLabel ?? "Working...")
                .font(.subheadline)
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer()

            // Chevron if there's a URL to open
            if hasUrl {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
        .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 4)
        .contentShape(Rectangle())
        .onTapGesture {
            if let urlString = message.toolUrl, let url = URL(string: urlString) {
                openURL(url)
            }
        }
    }

    @ViewBuilder
    private var statusIndicator: some View {
        if isComplete {
            if message.toolSuccess != true {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
                    .font(.system(size: 14))
            }
        } else {
            ProgressView()
                .scaleEffect(0.7)
                .frame(width: 14, height: 14)
        }
    }

    @ViewBuilder
    private var toolIcon: some View {
        let iconName = message.toolIcon ?? "gearshape"

        if sfSymbolIcons.contains(iconName) {
            // SF Symbol
            Image(systemName: iconName)
                .resizable()
                .aspectRatio(contentMode: .fit)
        } else {
            // Custom asset from Assets.xcassets (preserve original colors)
            Image(iconName)
                .resizable()
                .aspectRatio(contentMode: .fit)
        }
    }
}

// MARK: - Keyboard Dismissal Helper

#if canImport(UIKit)
private func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}
#else
private func hideKeyboard() {
    // No-op for non-UIKit platforms
}
#endif

#Preview {
    ChatView()
        .environment(\.chatManager, ChatManager())
}

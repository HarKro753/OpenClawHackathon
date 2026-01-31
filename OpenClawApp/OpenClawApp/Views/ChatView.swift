//
//  ChatView.swift
//  OpenClawApp
//

import SwiftUI

struct ChatView: View {
    @Environment(\.chatManager) private var chatManager: ChatManager
    @State private var showIntegrations = false

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
                                Text("Thinking…")
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
                .padding(16)
                .background(Color(.systemBackground))
            }
            .navigationTitle("OpenClaw")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Integrations") {
                        showIntegrations = true
                    }
                }
            }
            .fullScreenCover(isPresented: $showIntegrations) {
                IntegrationsView()
            }
        }
    }
}

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

    private var bubble: some View {
        Group {
            if message.role == .tool {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "wrench.and.screwdriver")
                        Text(message.toolName ?? "Tool")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }
                    if let command = message.toolCommand {
                        Text(command)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(8)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color(.tertiarySystemBackground))
                            )
                    }
                    if !message.content.isEmpty {
                        Text(message.content)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(.secondarySystemBackground))
                )
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
            }
        }
        .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 4)
        .frame(maxWidth: 320, alignment: message.role == .assistant || message.role == .tool ? .leading : .trailing)
    }
}

#Preview {
    ChatView()
        .environment(\.chatManager, ChatManager())
        .environment(\.integrationsManager, IntegrationsManager())
}

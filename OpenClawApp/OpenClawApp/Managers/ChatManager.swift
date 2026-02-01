//
//  ChatManager.swift
//  OpenClawApp
//

import Foundation
import Observation

enum ChatRole {
    case user
    case assistant
    case tool
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: ChatRole
    var content: String
    let timestamp: Date
    // Tool call properties - all populated from server-sent metadata
    var toolName: String? = nil
    var toolIcon: String? = nil     // SF Symbol or custom asset name (e.g., "safari", "google.docs")
    var toolLabel: String? = nil    // User-friendly label (e.g., "Creating document...")
    var toolUrl: String? = nil      // Clickable URL if available
    var toolSuccess: Bool? = nil    // Whether the tool call succeeded
}

@Observable
final class ChatManager {
    var messages: [ChatMessage] = []
    var input: String = ""
    var isLoading = false

    private let baseURL = URL(string: "http://192.168.178.141:3001")!

    func send() {
        Task { await sendMessage() }
    }

    @MainActor
    private func sendMessage() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isLoading else { return }

        messages.append(
            ChatMessage(role: .user, content: trimmed, timestamp: Date())
        )
        input = ""
        isLoading = true

        let apiMessages = messages.compactMap { message -> [String: String]? in
            switch message.role {
            case .user: return ["role": "user", "content": message.content]
            case .assistant:
                return ["role": "assistant", "content": message.content]
            case .tool: return nil
            }
        }

        var request = URLRequest(
            url: baseURL.appendingPathComponent("/api/chat")
        )
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "messages": apiMessages
        ])

        do {
            let (bytes, response) = try await URLSession.shared.bytes(
                for: request
            )
            if let httpResponse = response as? HTTPURLResponse,
                httpResponse.statusCode >= 400
            {
                appendAssistantError(
                    "Request failed with status \(httpResponse.statusCode)."
                )
                isLoading = false
                return
            }

            var assistantContent = ""
            var assistantMessageId: UUID?
            var toolMessageId: UUID?

            for try await line in bytes.lines {
                guard line.hasPrefix("data: ") else { continue }
                let data = String(line.dropFirst(6))
                if data == "[DONE]" { break }

                guard let payload = data.data(using: .utf8) else { continue }
                let json = try JSONSerialization.jsonObject(with: payload)
                guard let dict = json as? [String: Any] else { continue }

                let type = dict["type"] as? String
                if type == "tool_call" {
                    // Server sends: name, icon, label, toolCallId
                    let toolMessage = ChatMessage(
                        role: .tool,
                        content: "",
                        timestamp: Date(),
                        toolName: dict["name"] as? String,
                        toolIcon: dict["icon"] as? String,
                        toolLabel: dict["label"] as? String
                    )
                    toolMessageId = toolMessage.id
                    messages.append(toolMessage)
                } else if type == "tool_result" {
                    // Server sends: name, icon, label, url, success, (optional: output, error)
                    guard let toolId = toolMessageId else { continue }
                    updateMessage(id: toolId) { message in
                        message.toolSuccess = dict["success"] as? Bool
                        message.toolIcon = dict["icon"] as? String
                        message.toolLabel = dict["label"] as? String
                        message.toolUrl = dict["url"] as? String
                    }
                } else if type == "content" || dict["content"] != nil {
                    if let chunk = dict["content"] as? String, !chunk.isEmpty {
                        assistantContent += chunk
                        if let assistantId = assistantMessageId {
                            updateMessage(id: assistantId) { message in
                                message.content = assistantContent
                            }
                        } else {
                            let assistantMessage = ChatMessage(
                                role: .assistant,
                                content: assistantContent,
                                timestamp: Date()
                            )
                            assistantMessageId = assistantMessage.id
                            messages.append(assistantMessage)
                        }
                    }
                } else if type == "error" {
                    appendAssistantError(
                        dict["error"] as? String ?? "Unknown error"
                    )
                }
            }
        } catch {
            appendAssistantError(error.localizedDescription)
        }

        isLoading = false
    }

    private func appendAssistantError(_ error: String) {
        messages.append(
            ChatMessage(
                role: .assistant,
                content: "Error: \(error)",
                timestamp: Date()
            )
        )
    }

    private func updateMessage(id: UUID, update: (inout ChatMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else {
            return
        }
        var message = messages[index]
        update(&message)
        messages[index] = message
    }
}

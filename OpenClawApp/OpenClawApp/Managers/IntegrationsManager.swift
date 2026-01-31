//
//  IntegrationsManager.swift
//  OpenClawApp
//

import Foundation
import Observation

@Observable
final class IntegrationsManager {
    struct ConnectionStatus: Codable {
        let connected: Bool
    }

    struct IntegrationStatus: Codable {
        let notion: ConnectionStatus
        let gog: ConnectionStatus
        let linkedin: ConnectionStatus
    }

    var status: IntegrationStatus?
    var notionKey: String = ""
    var savingNotion = false
    var notionMessage: String?
    var linkedinLiAt: String = ""
    var linkedinJsessionId: String = ""
    var savingLinkedin = false
    var linkedinMessage: String?

    private let baseURL = URL(string: "http://localhost:3001")!

    @MainActor
    func fetchStatus() async {
        do {
            let url = baseURL.appendingPathComponent("/api/integrations/status")
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else { return }
            let decoded = try JSONDecoder().decode(IntegrationStatus.self, from: data)
            status = decoded
        } catch {
            // Ignore status errors for now
        }
    }

    @MainActor
    func saveNotionKey() async {
        let trimmed = notionKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        savingNotion = true
        notionMessage = nil

        var request = URLRequest(url: baseURL.appendingPathComponent("/api/integrations/notion"))
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["apiKey": trimmed])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return }
            if (200..<300).contains(httpResponse.statusCode) {
                notionMessage = "Notion API key saved."
                notionKey = ""
                await fetchStatus()
            } else {
                let error = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                notionMessage = error?["error"] as? String ?? "Failed to save Notion API key."
            }
        } catch {
            notionMessage = "Failed to save Notion API key."
        }

        savingNotion = false
    }

    @MainActor
    func saveLinkedinCookies() async {
        let liAt = linkedinLiAt.trimmingCharacters(in: .whitespacesAndNewlines)
        let jsessionId = linkedinJsessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !liAt.isEmpty, !jsessionId.isEmpty else { return }
        savingLinkedin = true
        linkedinMessage = nil

        var request = URLRequest(url: baseURL.appendingPathComponent("/api/integrations/linkedin"))
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "liAt": liAt,
            "jsessionId": jsessionId
        ])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return }
            if (200..<300).contains(httpResponse.statusCode) {
                linkedinMessage = "LinkedIn cookies saved."
                linkedinLiAt = ""
                linkedinJsessionId = ""
                await fetchStatus()
            } else {
                let error = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                linkedinMessage = error?["error"] as? String ?? "Failed to save LinkedIn cookies."
            }
        } catch {
            linkedinMessage = "Failed to save LinkedIn cookies."
        }

        savingLinkedin = false
    }
}

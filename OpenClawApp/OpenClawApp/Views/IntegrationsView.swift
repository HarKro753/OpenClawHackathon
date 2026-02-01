//
//  IntegrationsView.swift
//  OpenClawApp
//

import SwiftUI

struct IntegrationsView: View {
    @Environment(\.integrationsManager) private var integrationsManager: IntegrationsManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            @Bindable var integrationsManager = integrationsManager
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Google (gog)")
                                .font(.headline)
                            Spacer()
                            StatusPill(isConnected: integrationsManager.status?.gog.connected == true)
                        }
                        Text("Authenticate with Google so gog commands can access Gmail, Calendar, Drive, Docs, Sheets, and Contacts.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("Connect Google") {
                            openURL(URL(string: "http://localhost:3001/api/auth/google/start")!)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.vertical, 8)
                }

                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Notion")
                                .font(.headline)
                            Spacer()
                            StatusPill(isConnected: integrationsManager.status?.notion.connected == true)
                        }
                        Text("Create an integration in Notion and paste the API key here.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        SecureField("Notion API key", text: $integrationsManager.notionKey)
                            .textFieldStyle(.roundedBorder)

                        Button(integrationsManager.savingNotion ? "Saving..." : "Save Notion Key") {
                            Task { await integrationsManager.saveNotionKey() }
                        }
                        .buttonStyle(.bordered)
                        .disabled(integrationsManager.savingNotion)

                        if let message = integrationsManager.notionMessage {
                            Text(message)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Integrations")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await integrationsManager.fetchStatus()
            }
        }
    }
}

private struct StatusPill: View {
    let isConnected: Bool

    var body: some View {
        Text(isConnected ? "Connected" : "Not connected")
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isConnected ? Color.green.opacity(0.2) : Color.gray.opacity(0.2))
            )
            .foregroundStyle(isConnected ? Color.green : Color.secondary)
    }
}

#Preview {
    IntegrationsView()
        .environment(IntegrationsManager())
}

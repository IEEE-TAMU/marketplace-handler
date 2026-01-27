{pkgs ? import <nixpkgs> {}}:
pkgs.mkShellNoCC {
  nativeBuildInputs = [
    # pkgs.wrangler
    pkgs.nodejs
  ];
}
